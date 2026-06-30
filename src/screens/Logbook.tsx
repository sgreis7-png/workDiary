import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button, Tag, WeatherChip, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { listEntries } from '../api'
import { useStore } from '../store'
import type { Entry } from '../data'

const PAGE = 20

export default function Logbook() {
  const { t } = useI18n()
  const nav = useNavigate()
  const { projects, projectName, userName, projectColor } = useStore()
  const [projectId, setProjectId] = useState('')
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [more, setMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  // (re)load first page when the project filter changes — server-side, paginated
  useEffect(() => {
    let alive = true
    setEntries(null); setHasMore(true)
    listEntries(projectId || undefined, { limit: PAGE, offset: 0 })
      .then((e) => { if (alive) { setEntries(e); setHasMore(e.length === PAGE) } })
      .catch(() => { if (alive) setEntries([]) })
    return () => { alive = false }
  }, [projectId])

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <select className="input" style={{ width: 'auto', minWidth: 200 }} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t('all_projects')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="count mono">{entries.length} {t('entries')}</span>
        </div>
      </div>

      {entries.length === 0 ? (
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
                  {e.last_sent_at ? <Tag tone="green">✓ {t('sent')}</Tag> : <Tag tone="clay">לא נשלח</Tag>}
                </div>
              </div>
              <div className="entry-card__side">
                <span className="entry-card__date">{e.work_date}</span>
                <div className="entry-card__photos">
                  {e.photos.slice(0, 3).map((p, k) => <img key={k} src={p} alt="" />)}
                </div>
                <span className="count mono">{e.photos.length} {t('photos_n')}</span>
              </div>
            </motion.article>
          ))}
        </motion.div>
      )}

      {entries.length > 0 && hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
          <Button variant="ghost" onClick={loadMore} disabled={more}>
            {more ? <><span className="spin" /> {t('load_more')}</> : t('load_more')}
          </Button>
        </div>
      )}
    </div>
  )
}
