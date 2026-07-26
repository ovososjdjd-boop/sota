/** Склейка CSS-классов с отбрасыванием пустых значений. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
