<?php
/**
 * Plugin Name:  SureSend Reputation Monitor
 * Plugin URI:   https://github.com/frobobbo/sps-suresend
 * Description:  Monitors your domain's email and web reputation using the SureSend platform. Displays a full check dashboard and WP Admin widget.
 * Version:      1.3.0
 * Author:       StrategyPlus
 * License:      GPL-2.0+
 * Text Domain:  suresend
 */

defined( 'ABSPATH' ) || exit;

define( 'SURESEND_VERSION',    '1.3.0' );
define( 'SURESEND_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'SURESEND_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

class SureSend_Plugin {

	public function __construct() {
		add_action( 'admin_menu',            [ $this, 'add_menu' ] );
		add_action( 'admin_init',            [ $this, 'register_settings' ] );
		add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_assets' ] );
		add_action( 'wp_ajax_suresend_run_check', [ $this, 'ajax_run_check' ] );
		add_action( 'wp_dashboard_setup',    [ $this, 'add_dashboard_widget' ] );
		// Clear cached token + domain when settings change.
		add_action( 'updated_option', [ $this, 'on_option_updated' ], 10, 1 );
	}

	// ── Admin menu ────────────────────────────────────────────────────────────

	public function add_menu(): void {
		add_menu_page(
			'SureSend',
			'SureSend',
			'manage_options',
			'suresend',
			[ $this, 'render_dashboard' ],
			'dashicons-shield-alt',
			30
		);
		add_submenu_page(
			'suresend', 'Dashboard',  'Dashboard',  'manage_options', 'suresend',          [ $this, 'render_dashboard' ]
		);
		add_submenu_page(
			'suresend', 'Settings',   'Settings',   'manage_options', 'suresend-settings', [ $this, 'render_settings' ]
		);
	}

	public function register_settings(): void {
		register_setting( 'suresend_options', 'suresend_api_url',  [ 'sanitize_callback' => 'esc_url_raw' ] );
		register_setting( 'suresend_options', 'suresend_email',    [ 'sanitize_callback' => 'sanitize_email' ] );
		register_setting( 'suresend_options', 'suresend_password', [ 'sanitize_callback' => 'sanitize_text_field' ] );
	}

	public function on_option_updated( string $option ): void {
		if ( in_array( $option, [ 'suresend_api_url', 'suresend_email', 'suresend_password' ], true ) ) {
			delete_transient( 'suresend_jwt_token' );
			delete_option( 'suresend_domain_id' );
		}
	}

	public function enqueue_assets( string $hook ): void {
		if ( strpos( $hook, 'suresend' ) === false && $hook !== 'index.php' ) {
			return;
		}
		wp_enqueue_style(
			'suresend-admin',
			SURESEND_PLUGIN_URL . 'assets/admin.css',
			[],
			SURESEND_VERSION
		);
		wp_enqueue_script(
			'suresend-admin',
			SURESEND_PLUGIN_URL . 'assets/admin.js',
			[ 'jquery' ],
			SURESEND_VERSION,
			true
		);
		wp_localize_script( 'suresend-admin', 'sureSendData', [
			'ajaxUrl' => admin_url( 'admin-ajax.php' ),
			'nonce'   => wp_create_nonce( 'suresend_run_check' ),
		] );
	}

	// ── API client ────────────────────────────────────────────────────────────

	private function get_token(): ?string {
		$cached = get_transient( 'suresend_jwt_token' );
		if ( $cached ) {
			return $cached;
		}

		$api_url  = get_option( 'suresend_api_url', '' );
		$email    = get_option( 'suresend_email', '' );
		$password = get_option( 'suresend_password', '' );

		if ( ! $api_url || ! $email || ! $password ) {
			return null;
		}

		$response = wp_remote_post(
			trailingslashit( $api_url ) . 'auth/login',
			[
				'headers' => [ 'Content-Type' => 'application/json' ],
				'body'    => wp_json_encode( [ 'email' => $email, 'password' => $password ] ),
				'timeout' => 15,
			]
		);

		if ( is_wp_error( $response ) ) {
			return null;
		}

		$body  = json_decode( wp_remote_retrieve_body( $response ), true );
		$token = $body['access_token'] ?? null;

		if ( $token ) {
			set_transient( 'suresend_jwt_token', $token, 6 * HOUR_IN_SECONDS );
		}

		return $token;
	}

	private function api_get( string $path ): ?array {
		$token = $this->get_token();
		if ( ! $token ) {
			return null;
		}

		$response = wp_remote_get(
			trailingslashit( get_option( 'suresend_api_url', '' ) ) . ltrim( $path, '/' ),
			[
				'headers' => [
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
				],
				'timeout' => 30,
			]
		);

		if ( is_wp_error( $response ) || wp_remote_retrieve_response_code( $response ) >= 400 ) {
			return null;
		}

		return json_decode( wp_remote_retrieve_body( $response ), true );
	}

	private function api_post( string $path, array $body = [] ): ?array {
		$token = $this->get_token();
		if ( ! $token ) {
			return null;
		}

		$response = wp_remote_post(
			trailingslashit( get_option( 'suresend_api_url', '' ) ) . ltrim( $path, '/' ),
			[
				'headers' => [
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
				],
				'body'    => wp_json_encode( $body ),
				'timeout' => 60,
			]
		);

		if ( is_wp_error( $response ) || wp_remote_retrieve_response_code( $response ) >= 400 ) {
			return null;
		}

		return json_decode( wp_remote_retrieve_body( $response ), true );
	}

	// ── Domain resolution ─────────────────────────────────────────────────────

	private function get_domain_id(): ?string {
		$stored = get_option( 'suresend_domain_id', '' );
		if ( $stored ) {
			return $stored;
		}

		$site_domain = $this->site_domain();
		$domains     = $this->api_get( 'domains' );
		if ( ! $domains ) {
			return null;
		}

		foreach ( $domains as $domain ) {
			if ( ( $domain['name'] ?? '' ) === $site_domain ) {
				update_option( 'suresend_domain_id', $domain['id'] );
				return $domain['id'];
			}
		}

		// Create the domain automatically.
		$created = $this->api_post( 'domains', [ 'name' => $site_domain ] );
		if ( $created && ! empty( $created['id'] ) ) {
			update_option( 'suresend_domain_id', $created['id'] );
			return $created['id'];
		}

		return null;
	}

	private function site_domain(): string {
		$host = parse_url( get_site_url(), PHP_URL_HOST ) ?? '';
		return $this->extract_root_domain( $host );
	}

	private function extract_root_domain( string $host ): string {
		$parts = explode( '.', $host );
		$count = count( $parts );

		if ( $count <= 2 ) {
			return $host;
		}

		// Handle ccTLD + SLD patterns like co.uk, com.au, org.nz — the SLD
		// portion is typically 2–3 chars and the ccTLD is always 2 chars.
		$tld = $parts[ $count - 1 ];
		$sld = $parts[ $count - 2 ];

		if ( strlen( $tld ) === 2 && strlen( $sld ) <= 3 ) {
			return implode( '.', array_slice( $parts, -3 ) );
		}

		return implode( '.', array_slice( $parts, -2 ) );
	}

	private function get_latest_check(): ?array {
		$domain_id = $this->get_domain_id();
		if ( ! $domain_id ) {
			return null;
		}

		$checks = $this->api_get( "domains/{$domain_id}/reputation" );
		if ( ! $checks || empty( $checks ) ) {
			return null;
		}

		return $checks[0];
	}

	// ── AJAX ─────────────────────────────────────────────────────────────────

	public function ajax_run_check(): void {
		check_ajax_referer( 'suresend_run_check', 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'Forbidden' );
		}

		$domain_id = $this->get_domain_id();
		if ( ! $domain_id ) {
			wp_send_json_error( [ 'message' => 'Domain not found. Please check your API settings.' ] );
		}

		$result = $this->api_post( "domains/{$domain_id}/reputation/check" );
		if ( ! $result ) {
			wp_send_json_error( [ 'message' => 'Check failed. Verify your API URL and credentials.' ] );
		}

		wp_send_json_success( $result );
	}

	// ── Dashboard widget ──────────────────────────────────────────────────────

	public function add_dashboard_widget(): void {
		wp_add_dashboard_widget(
			'suresend_widget',
			'<img src="' . esc_url( SURESEND_PLUGIN_URL . 'assets/logo.png' ) . '" alt="SureSend" style="height:20px;vertical-align:middle;margin-right:6px"> Domain Reputation',
			[ $this, 'render_dashboard_widget' ]
		);
	}

	public function render_dashboard_widget(): void {
		$configured = $this->is_configured();
		if ( ! $configured ) {
			printf(
				'<p>Configure your <a href="%s">SureSend settings</a> to start monitoring.</p>',
				esc_url( admin_url( 'admin.php?page=suresend-settings' ) )
			);
			return;
		}

		$check = $this->get_latest_check();
		if ( ! $check ) {
			printf(
				'<p>No checks run yet. <a href="%s">Go to the dashboard</a> to run your first check.</p>',
				esc_url( admin_url( 'admin.php?page=suresend' ) )
			);
			return;
		}

		$score  = (int) ( $check['score'] ?? 0 );
		$status = $check['status'] ?? 'unknown';
		$color  = $this->status_color( $status );
		$date   = wp_date( 'j M Y H:i', strtotime( $check['checkedAt'] ?? 'now' ) );
		?>
		<div class="ss-widget-row">
			<div class="ss-gauge" style="background:<?php echo esc_attr( $color ); ?>"><?php echo esc_html( $score ); ?></div>
			<div class="ss-widget-meta">
				<span class="ss-badge ss-badge-<?php echo esc_attr( $status ); ?>"><?php echo esc_html( ucfirst( $status ) ); ?></span>
				<span class="ss-domain"><?php echo esc_html( $this->site_domain() ); ?></span>
				<span class="ss-date">Checked: <?php echo esc_html( $date ); ?></span>
			</div>
		</div>
		<p style="margin:10px 0 0">
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=suresend' ) ); ?>" class="button button-small">View full report</a>
		</p>
		<?php
	}

	// ── Settings page ─────────────────────────────────────────────────────────

	public function render_settings(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		// Handle reset.
		if ( isset( $_POST['suresend_reset'] ) && check_admin_referer( 'suresend_reset' ) ) {
			delete_transient( 'suresend_jwt_token' );
			delete_option( 'suresend_domain_id' );
			echo '<div class="notice notice-success is-dismissible"><p>Connection cache cleared.</p></div>';
		}

		$domain_id   = get_option( 'suresend_domain_id', '' );
		$site_domain = $this->site_domain();
		?>
		<div class="wrap ss-wrap">
			<h1>SureSend — Settings</h1>

			<form method="post" action="options.php">
				<?php settings_fields( 'suresend_options' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="suresend_api_url">API Base URL</label></th>
						<td>
							<input
								type="url"
								id="suresend_api_url"
								name="suresend_api_url"
								value="<?php echo esc_attr( get_option( 'suresend_api_url' ) ); ?>"
								class="regular-text"
								placeholder="https://api.yourdomain.com"
							/>
							<p class="description">The URL of your SureSend NestJS API. No trailing slash.</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="suresend_email">Account Email</label></th>
						<td>
							<input
								type="email"
								id="suresend_email"
								name="suresend_email"
								value="<?php echo esc_attr( get_option( 'suresend_email' ) ); ?>"
								class="regular-text"
							/>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="suresend_password">Password</label></th>
						<td>
							<input
								type="password"
								id="suresend_password"
								name="suresend_password"
								value="<?php echo esc_attr( get_option( 'suresend_password' ) ); ?>"
								class="regular-text"
								autocomplete="new-password"
							/>
							<p class="description">Stored in the WordPress options table. Use a dedicated read-only account.</p>
						</td>
					</tr>
					<tr>
						<th scope="row">Monitored Domain</th>
						<td>
							<?php if ( $domain_id ) : ?>
								<strong><?php echo esc_html( $site_domain ); ?></strong>
								&nbsp;<span class="ss-badge ss-badge-clean">Connected</span>
							<?php else : ?>
								<span class="description">Will auto-detect as <strong><?php echo esc_html( $site_domain ); ?></strong> on first check.</span>
							<?php endif; ?>
						</td>
					</tr>
				</table>
				<?php submit_button( 'Save Settings' ); ?>
			</form>

			<hr />
			<h2>Reset Connection</h2>
			<p>Clear the cached auth token and domain ID (useful after changing credentials or moving to a new environment).</p>
			<form method="post">
				<?php wp_nonce_field( 'suresend_reset' ); ?>
				<input type="hidden" name="suresend_reset" value="1" />
				<?php submit_button( 'Reset Connection Cache', 'secondary', 'submit', false ); ?>
			</form>
		</div>
		<?php
	}

	// ── Main dashboard page ───────────────────────────────────────────────────

	public function render_dashboard(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$configured  = $this->is_configured();
		$check       = $configured ? $this->get_latest_check() : null;
		$site_domain = $this->site_domain();
		?>
		<div class="wrap ss-wrap">
			<div class="ss-page-header">
				<div class="ss-page-title">
					<img src="<?php echo esc_url( SURESEND_PLUGIN_URL . 'assets/logo.png' ); ?>" alt="SureSend" class="ss-page-logo" />
					<span class="ss-page-domain"><?php echo esc_html( $site_domain ); ?></span>
				</div>
				<?php if ( $configured ) : ?>
					<button id="ss-run-check" class="button button-primary">
						<span class="dashicons dashicons-update ss-icon-hidden"></span>
						<span class="ss-btn-label">Run Check Now</span>
					</button>
				<?php else : ?>
					<a href="<?php echo esc_url( admin_url( 'admin.php?page=suresend-settings' ) ); ?>" class="button">
						Configure Settings
					</a>
				<?php endif; ?>
			</div>

			<div id="ss-notice" class="notice is-dismissible" style="display:none"></div>

			<?php if ( ! $configured ) : ?>
				<div class="notice notice-warning inline">
					<p>
						Please <a href="<?php echo esc_url( admin_url( 'admin.php?page=suresend-settings' ) ); ?>">configure your API settings</a>
						to get started.
					</p>
				</div>

			<?php elseif ( ! $check ) : ?>
				<div class="notice notice-info inline">
					<p>No checks run yet. Click <strong>Run Check Now</strong> to get your first reputation report.</p>
				</div>

			<?php else : ?>
				<?php $this->render_full_report( $check ); ?>
			<?php endif; ?>
		</div>
		<?php
	}

	// ── Report rendering ──────────────────────────────────────────────────────

	private function render_full_report( array $check ): void {
		$score  = (int) ( $check['score'] ?? 0 );
		$status = $check['status'] ?? 'unknown';
		$color  = $this->status_color( $status );
		$date   = wp_date( 'j M Y H:i', strtotime( $check['checkedAt'] ?? 'now' ) );
		$d      = $check['details'] ?? [];
		?>
		<div class="ss-report">

			<!-- Score panel -->
			<div class="ss-score-panel">
				<div class="ss-gauge-large" style="background:<?php echo esc_attr( $color ); ?>">
					<?php echo esc_html( $score ); ?>
				</div>
				<span class="ss-badge ss-badge-<?php echo esc_attr( $status ); ?>">
					<?php echo esc_html( ucfirst( $status ) ); ?>
				</span>
				<p class="ss-date">Checked: <?php echo esc_html( $date ); ?></p>
			</div>

			<!-- Checks grid -->
			<div class="ss-checks-grid">

				<?php
				// Email Authentication
				$this->render_section( 'Email Authentication', [
					$this->check_row( 'MX Records',  $d['mx']['pass']    ?? false, $d['mx']['records'][0]    ?? '' ),
					$this->check_row( 'SPF',         $d['spf']['pass']   ?? false, $this->spf_detail( $d['spf'] ?? [] ) ),
					$this->check_row( 'DMARC',       $d['dmarc']['pass'] ?? false, $this->dmarc_detail( $d['dmarc'] ?? [] ) ),
					$this->check_row( 'DKIM',        $d['dkim']['pass']  ?? false, $d['dkim']['selector'] ?? '' ),
				] );

				// Web Security
				$web = [
					$this->check_row( 'HTTPS', $d['https']['pass'] ?? false, $d['https']['statusCode'] ?? '' ),
				];
				if ( isset( $d['httpsRedirect'] ) ) {
					$web[] = $this->check_row( 'HTTP→HTTPS Redirect', $d['httpsRedirect']['pass'] );
				}
				if ( isset( $d['ssl'] ) ) {
					$days  = $d['ssl']['daysUntilExpiry'];
					$label = $days !== null ? ( $days > 0 ? "{$days}d remaining" : 'Expired' ) : '';
					$web[] = $this->check_row( 'SSL Certificate', $d['ssl']['pass'] ?? false, $label );
				}
				if ( isset( $d['securityHeaders'] ) ) {
					$web[] = $this->check_row( 'HSTS',                $d['securityHeaders']['hsts']                ?? false );
					$web[] = $this->check_row( 'X-Content-Type-Opts', $d['securityHeaders']['xContentTypeOptions'] ?? false );
					$web[] = $this->check_row( 'X-Frame-Options',     $d['securityHeaders']['xFrameOptions']       ?? false );
				}
				$this->render_section( 'Web Security', $web );

				// Email Transport Security
				$et = [];
				if ( isset( $d['mtaSts'] ) ) $et[] = $this->check_row( 'MTA-STS',  $d['mtaSts']['pass'],  $d['mtaSts']['policy'] ?? '' );
				if ( isset( $d['tlsRpt'] ) ) $et[] = $this->check_row( 'TLS-RPT',  $d['tlsRpt']['pass'] );
				if ( isset( $d['bimi'] ) )   $et[] = $this->check_row( 'BIMI',     $d['bimi']['pass'] );
				if ( $et ) $this->render_section( 'Email Transport Security', $et );

				// DNS Health
				$dns = [];
				if ( isset( $d['nsCount'] ) ) $dns[] = $this->check_row( 'Nameservers', $d['nsCount']['pass'], ( $d['nsCount']['count'] ?? 0 ) . ' found' );
				if ( isset( $d['caa'] ) )     $dns[] = $this->check_row( 'CAA Records', $d['caa']['pass'],    $d['caa']['records'][0] ?? '' );
				if ( isset( $d['ptr'] ) )     $dns[] = $this->check_row( 'PTR / rDNS',  $d['ptr']['pass'],    $d['ptr']['hostname']   ?? '' );
				if ( $dns ) $this->render_section( 'DNS Health', $dns );

				// Blacklists
				$bl_rows = [];
				foreach ( $d['blacklists'] ?? [] as $bl ) {
					if ( ! empty( $bl['blocked'] ) ) {
						$bl_rows[] = $this->warn_row( $bl['list'] . ' (unverifiable)' );
					} else {
						$bl_rows[] = $this->check_row( $bl['list'], ! ( $bl['listed'] ?? false ) );
					}
				}
				if ( isset( $d['dbl'] ) ) {
					$bl_rows[] = $this->check_row( 'Spamhaus DBL', ! ( $d['dbl']['listed'] ?? false ) );
				}
				if ( $bl_rows ) $this->render_section( 'Blacklists', $bl_rows, true );
				?>

			</div><!-- .ss-checks-grid -->
		</div><!-- .ss-report -->
		<?php
	}

	// ── Section / row helpers ─────────────────────────────────────────────────

	private function render_section( string $title, array $rows, bool $two_col = false ): void {
		$cls = $two_col ? 'ss-section ss-two-col' : 'ss-section';
		echo '<div class="' . esc_attr( $cls ) . '">';
		echo '<h3>' . esc_html( $title ) . '</h3>';
		echo '<div class="ss-rows">';
		foreach ( $rows as $row ) {
			echo $row; // Already escaped by check_row / warn_row.
		}
		echo '</div></div>';
	}

	private function check_row( string $label, bool $pass, string $detail = '' ): string {
		$icon_cls = $pass ? 'dashicons-yes-alt ss-icon-pass' : 'dashicons-dismiss ss-icon-fail';
		$row_cls  = $pass ? 'ss-row ss-row-pass' : 'ss-row ss-row-fail';
		$out  = '<div class="' . esc_attr( $row_cls ) . '">';
		$out .= '<span class="dashicons ' . esc_attr( $icon_cls ) . '"></span>';
		$out .= '<span class="ss-label">' . esc_html( $label ) . '</span>';
		if ( $detail !== '' ) {
			$out .= '<span class="ss-detail">' . esc_html( $detail ) . '</span>';
		}
		$out .= '</div>';
		return $out;
	}

	private function warn_row( string $label ): string {
		return '<div class="ss-row ss-row-warn"><span class="dashicons dashicons-warning ss-icon-warn"></span><span class="ss-label">' . esc_html( $label ) . '</span></div>';
	}

	// ── Label helpers ─────────────────────────────────────────────────────────

	private function spf_detail( array $spf ): string {
		if ( ! ( $spf['pass'] ?? false ) ) return '';
		$map = [ 'hard_fail' => '-all (strict)', 'soft_fail' => '~all (soft)', 'pass_all' => '+all (unsafe)', 'permissive' => 'no all' ];
		return $map[ $spf['policy'] ?? '' ] ?? ( $spf['policy'] ?? '' );
	}

	private function dmarc_detail( array $dmarc ): string {
		if ( ! ( $dmarc['pass'] ?? false ) ) return '';
		$parts = [];
		if ( isset( $dmarc['policy'] ) ) $parts[] = 'p=' . $dmarc['policy'];
		if ( isset( $dmarc['hasRua'] ) && ! $dmarc['hasRua'] ) $parts[] = 'no rua';
		return implode( ', ', $parts );
	}

	private function status_color( string $status ): string {
		return match ( $status ) {
			'clean'       => '#10b981',
			'warning'     => '#f59e0b',
			default       => '#ef4444',
		};
	}

	private function is_configured(): bool {
		return (bool) get_option( 'suresend_api_url' )
			&& (bool) get_option( 'suresend_email' )
			&& (bool) get_option( 'suresend_password' );
	}
}

new SureSend_Plugin();
