-- Sending a report was open to any active member, with the body supplied by the client — so it
-- could carry any content at all, to any address, 30 sends an hour at 50 recipients each. And
-- nothing recorded it: rate_events knows somebody sent something at some time, not what or to whom.
--
-- Recipients are deliberately not restricted; sending outside the company is a requirement. What
-- was missing is who may use it, and a trace of every use.

/** May the caller send a report at all?
 *
 *  Sending is an extension of reading: a report is a diary entry or a house inspection, so anyone
 *  who can see either may send one. Somebody with neither has nothing legitimate to send, and
 *  letting them post arbitrary HTML through the company's sending identity is the difference
 *  between a feature and an open relay. Admins and managers always may. */
create or replace function may_send_report()
returns boolean
language sql stable security definer set search_path = public as $$
  select is_member() and (
    is_manager() or can_view('logbook') or can_view('defects') or can_view('export')
  );
$$;

revoke all on function may_send_report() from public;
grant execute on function may_send_report() to authenticated;

/** Record a send. Called by the edge function with the service role.
 *
 *  Recipients are the point of the record: if a report leaves the company, this is the only thing
 *  that says who sent it and where. audit_log is admin-readable only. */
create or replace function log_report_send(
  p_actor text, p_subject text, p_recipients text[], p_sent_as text
)
returns void
language sql security definer set search_path = public as $$
  insert into audit_log (actor_email, action, entity, entity_id, details)
  values (
    lower(p_actor), 'send_report', 'report', null,
    jsonb_build_object(
      'subject', left(coalesce(p_subject, ''), 300),
      'recipients', to_jsonb(coalesce(p_recipients, '{}')),
      'recipient_count', coalesce(array_length(p_recipients, 1), 0),
      -- worth keeping: an address outside the company is the case an auditor cares about
      'external_count', (
        select count(*) from unnest(coalesce(p_recipients, '{}')) e
        where e not ilike '%@agrotop.co.il'
      ),
      'sent_as', p_sent_as
    )
  );
$$;

-- Service role only — see 0054 for why naming the roles explicitly is the part that matters.
revoke all on function log_report_send(text, text, text[], text) from public;

comment on function may_send_report() is
  'Gate for the send-report edge function: sending is an extension of being allowed to read a report.';
comment on function log_report_send(text, text, text[], text) is
  'Audit trail for outgoing report email. Service-role only; audit_log is admin-readable.';
