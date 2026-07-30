/**
 * Join class names, dropping falsy entries.
 *
 * Deliberately tiny and dependency-free. There is no `clsx` here because the
 * only thing needed is conditional joining, and a primitive that every component
 * imports should not pull in a package.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
