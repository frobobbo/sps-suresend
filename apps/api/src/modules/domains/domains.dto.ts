import {
  IsEmail,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class SetCloudflareTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;
}

export class CreateDomainDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name!: string;
}

export class DelegateAccessDto {
  @ValidateIf((dto: DelegateAccessDto) => !dto.email)
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ValidateIf((dto: DelegateAccessDto) => !dto.userId)
  @IsEmail()
  @IsOptional()
  email?: string;
}

export class UpdateMonitoringDto {
  @IsOptional()
  @IsInt()
  @Min(15)
  scanIntervalMinutes?: number | null;

  @IsOptional()
  @IsBoolean()
  alertsEnabled?: boolean;
}
