import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateDomainDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name: string;
}

export class DelegateAccessDto {
  @IsUUID()
  userId: string;
}
