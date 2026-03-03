/* global jQuery, sureSendData */
( function ( $ ) {
	'use strict';

	$( function () {
		var $btn    = $( '#ss-run-check' );
		var $icon   = $btn.find( '.dashicons' );
		var $label  = $btn.find( '.ss-btn-label' );
		var $notice = $( '#ss-notice' );

		if ( ! $btn.length ) {
			return;
		}

		$btn.on( 'click', function () {
			$btn.prop( 'disabled', true );
			$icon.removeClass( 'ss-icon-hidden' ).addClass( 'ss-spinning' );
			$label.text( 'Running…' );

			$notice.hide().removeClass( 'is-success is-error' );

			$.post( sureSendData.ajaxUrl, {
				action: 'suresend_run_check',
				nonce:  sureSendData.nonce,
			} )
			.done( function ( response ) {
				if ( response.success ) {
					showNotice( 'success', 'Check complete! Refreshing…' );
					setTimeout( function () {
						window.location.reload();
					}, 1500 );
				} else {
					var msg = ( response.data && response.data.message )
						? response.data.message
						: 'An unknown error occurred.';
					showNotice( 'error', 'Check failed: ' + msg );
					resetBtn();
				}
			} )
			.fail( function () {
				showNotice( 'error', 'Network error — please try again.' );
				resetBtn();
			} );
		} );

		function resetBtn() {
			$btn.prop( 'disabled', false );
			$icon.addClass( 'ss-icon-hidden' ).removeClass( 'ss-spinning' );
			$label.text( 'Run Check Now' );
		}

		function showNotice( type, message ) {
			$notice
				.removeClass( 'is-success is-error' )
				.addClass( type === 'success' ? 'is-success' : 'is-error' )
				.html( '<p>' + message + '</p>' )
				.show();
		}
	} );
} )( jQuery );
