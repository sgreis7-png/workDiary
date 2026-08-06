/**
 * Escape a value for interpolation into report/email HTML.
 *
 * Both report builders emit HTML by string concatenation, so this is the only
 * thing standing between a field value and injection into a recipient's mail
 * client. It lived as two byte-identical private copies, one of which had an
 * injection test and one of which did not.
 */
export function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ))
}
