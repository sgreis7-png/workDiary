import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Tag, WeatherChip, stagger, riseIn } from '../components/ui'
import { useI18n } from '../i18n'
import { listEntries, projectName, userName, projectColor, PROJECTS } from '../data'

export default function Logbook() {
  const { t } = useI18n()
  const nav = useNavigate()
  const [projectId, setProjectId] = useState('')
  const all = listEntries()
  const entries = useMemo(() => projectId ? all.filter((e) => e.project_id === projectId) : all, [projectId, all])

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
            {PROJECTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
    </div>
  )
}
