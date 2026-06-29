export class HealthDto {
  status!: 'ok' | 'error';
  service!: string;
}
