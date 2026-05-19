import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RegisterGuestDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del invitado no puede estar vacío' })
  @MaxLength(100)
  guestName!: string;
}
