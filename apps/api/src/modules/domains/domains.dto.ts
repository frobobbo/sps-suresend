import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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
  @IsUUID()
  userId!: string;
}
