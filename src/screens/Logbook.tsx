import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button, Tag, WeatherChip, Field, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { listEntries, searchEntries } from '../api'
import { useStore } from '../store'
import type { Entry } from '../data'
import { MALFUNCTION_DEPTS, MALFUNCTION_DEPT_KEY, deptIdOf, deptLabel, hasMalfunction } from '../data'
import { usePerms } from '../lib/usePerms'

const PAGE = 20

export default function Logbook() {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const { projects, projectName, userName, projectColor } = useStore()
  const { can } = usePerms()
  // The digest has always linked here as /?p=<id>; nothing read it, so the filter stayed
  // on "all projects" and the link looked broken.
  const [params] = useSearchParams()
  const [projectId, setProjectId] = useState(() => params.get('p') ?? '')
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [more, setMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  // Search lives inside the logbook tab (same pattern as the safety log):
  // the bar folds open on demand, and any criterion switches the list to
  // live search results. Closing the bar clears the criteria.
  const [searchOpen, setSearchOpen] = useState(false)
  const [text, setText] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [malfunction, setMalfunction] = useState('')
  const [results, setResults] = useState<Entry[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [busy, setBusy] = useState(false)
  const searching = searchOpen && Boolean(text.trim() || from || to || malfunction)

  // (re)load first page when the project filter changes — server-side, paginated
  useEffect(() => {
    let alive = true
    setEntries(null); setHasMore(true)
    listEntries(projectId || undefined, { limit: PAGE, offset: 0 })
      .then((e) => { if (alive) { setEntries(e); setHasMore(e.length === PAGE) } })
      .catch(() => { if (alive) setEntries([]) })
    return () => { alive = false }
  }, [projectId])

  // Live search: runs as criteria change; cleared the moment none remain.
  useEffect(() => {
    if (!searching) { setResults(null); setTruncated(false); setBusy(false); return }
    setBusy(true)
    let alive = true
    const handle = setTimeout(() => {
      searchEntries(
        { projectId: projectId || undefined, from: from || undefined, to: to || undefined, text: text || undefined, malfunction: malfunction || undefined },
        { photos: false }, // results are text rows; opening one signs its own photos
      )
        .then((r) => { if (alive) { setResults(r.rows); setTruncated(r.truncated) } })
        .catch(() => { if (alive) { setResults([]); setTruncated(false) } })
        .finally(() => { if (alive) setBusy(false) })
    }, 300)
    return () => { alive = false; clearTimeout(handle) }
  }, [searching, projectId, from, to, text, malfunction])

  const toggleSearch = () => {
    setSearchOpen((open) => {
      if (open) { setText(''); setFrom(''); setTo(''); setMalfunction('') }
      return !open
    })
  }

  const loadMore = async () => {
    if (!entries) return
    setMore(true)
    try {
      const next = await listEntries(projectId || undefined, { limit: PAGE, offset: entries.length })
      setEntries([...entries, ...next]); setHasMore(next.length === PAGE)
    } finally { setMore(false) }
  }

  if (!entries) return <Loader full label={t('app_sub')} />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{t('app_sub')}</div>
          <h1 className="page-title">{t('nav_log')}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {can('search') && (
            <button
              className={`btn ${searchOpen ? 'btn--primary' : 'btn--ghost'}`}
              onClick={toggleSearch}
              aria-expanded={searchOpen}
            >⌕ {t('nav_search')}</button>
          )}
          <select className="input" style={{ width: 'auto', minWidth: 200 }} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t('all_projects')}</option>
            {projects.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {searching
            ? (busy
              ? <span className="count mono"><span className="spin" /></span>
              : results && <span className="count mono">{results.length} {t('results_n')}</span>)
            : <span className="count mono">{entries.length} {t('entries')}</span>}
        </div>
      </div>

      {searchOpen && (
        <div className="search-bar">
          <Field label={t('free_text')}>
            <input className="input" placeholder="…" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          </Field>
          <Field label={t('malf_filter')}>
            <select className="input" value={malfunction} onChange={(e) => setMalfunction(e.target.value)}>
              <option value="">{t('malf_all')}</option>
              <option value="any">{t('malf_any')}</option>
              <option value="none">{t('malf_none')}</option>
              {MALFUNCTION_DEPTS.filter((d) => d.id !== 'none').map((d) => (
                <option key={d.id} value={d.id}>{lang === 'he' ? d.he : d.en}</option>
              ))}
            </select>
          </Field>
          <Field label={t('from_date')}><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label={t('to_date')}><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      )}

      {searching ? (
        <>
          {truncated && <div className="alert">{t('search_truncated')}</div>}
          {results && (
            <motion.div className="panel" variants={stagger} initial="hidden" animate="show">
              <div className="row-list">
                {results.length === 0 && <div className="empty"><div className="big">{t('no_entries')}</div></div>}
                {results.map((e) => (
                  <motion.div key={e.id} variants={riseIn} className="row-item" style={{ cursor: 'pointer' }} onClick={() => nav(`/entry/${e.id}`)}>
                    <span className="mono" style={{ color: 'var(--ink-3)' }}>{e.work_date}</span>
                    <div className="grow">
                      <b>{projectName(e.project_id)}</b> <small>· {e.values.site_location}</small>
                      <div style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 2 }}>{e.values.daily_content}</div>
                    </div>
                    <WeatherChip value={e.values.weather} />
                    {hasMalfunction(e.values) && (
                      <Tag tone="clay">{t('malf_filter')} · {deptLabel(deptIdOf(e.values[MALFUNCTION_DEPT_KEY]), lang)}</Tag>
                    )}
                    {e.last_sent_at && <Tag tone="green">✓</Tag>}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </>
      ) : entries.length === 0 ? (
        <div className="empty"><div className="big">{t('no_entries')}</div></div>
      ) : (
        <motion.div className="entry-list" variants={stagger} initial="hidden" animate="show" key={projectId}>
          {entries.map((e, i) => (
            <motion.article
              key={e.id} className="entry-card" variants={riseIn}
              onClick={() => nav(`/entry/${e.id}`)} style={{ cursor: 'pointer' }}
            >
              <div className="entry-card__index" style={{ color: projectColor(e.project_id) }}>
                {String(entries.length - i).padStart(2, '0')}
                <small>NO.</small>
              </div>
              <div className="entry-card__body">
                <div className="entry-card__proj">{projectName(e.project_id)}</div>
                <div className="entry-card__loc">{e.values.site_location} · {t('created_by')} {userName(e.created_by)}</div>
                <p className="entry-card__excerpt">{e.values.daily_content}</p>
                <div className="entry-card__meta">
                  <WeatherChip value={e.values.weather} />
                  <Tag tone="muted">{e.values.contractor}</Tag>
                  {e.last_sent_at ? <Tag tone="green">✓ {t('sent')}</Tag> : <Tag tone="clay">{t('not_sent')}</Tag>}
                </div>
              </div>
              <div className="entry-card__side">
                <span className="entry-card__date">{e.work_date}</span>
                <div className="entry-card__photos">
                  {/* Site photos are stored up to 1920px and shown at 38px. Without lazy
                      loading the browser fetches and decodes three of them per card for
                      the whole list at once, which is what made scrolling stutter. */}
                  {e.photos.slice(0, 3).map((p, k) => (
                    <img key={k} src={p} alt="" width={38} height={38} loading="lazy" decoding="async" />
                  ))}
                </div>
                <span className="count mono">{e.photos.length} {t('photos_n')}</span>
              </div>
            </motion.article>
          ))}
        </motion.div>
      )}

      {!searching && entries.length > 0 && hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
          <Button variant="ghost" onClick={loadMore} disabled={more}>
            {more ? <><span className="spin" /> {t('load_more')}</> : t('load_more')}
          </Button>
        </div>
      )}
    </div>
  )
}
