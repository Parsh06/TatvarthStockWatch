import { motion } from 'framer-motion'
import { useDashboardOverview } from '../../hooks/useDashboardOverview'
import PageTransition from '../Common/PageTransition'
import Loader from '../Common/Loader'

import DashboardHeader               from './DashboardHeader'
import PrimaryIndicesWidget          from './PrimaryIndicesWidget'
import AnnouncementOverviewWidget    from './AnnouncementOverviewWidget'
import AnnouncementCategoryWidget    from './AnnouncementCategoryWidget'
import MarketMoversWidget             from './MarketMoversWidget'
import IpoActivityWidget              from './IpoActivityWidget'
import WatchlistSummaryWidget         from './WatchlistSummaryWidget'
import BoardMeetingsWidget            from './BoardMeetingsWidget'
import AgmWidget                      from './AgmWidget'
import VolumeSpurtWidget              from './VolumeSpurtWidget'
import DealsWidget                    from './DealsWidget'
import TopWatchlistCompaniesWidget    from './TopWatchlistCompaniesWidget'
import WatchlistGroupsWidget          from './WatchlistGroupsWidget'

// Simple fade-up animation for each section row
const fadeUp = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } }
}

function Row({ children, className = '' }) {
  return (
    <motion.div variants={fadeUp} className={className}>
      {children}
    </motion.div>
  )
}

export default function DashboardPage() {
  const {
    data,
    loading,
    error,
    refreshing,
    lastUpdated,
    refresh,
    sourceStatus,
  } = useDashboardOverview()

  const d = data || {}

  if (loading && (!data || Object.keys(data).length === 0)) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader />
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
        className="space-y-5 pb-12"
      >
        {/* ── Row 1: Header ─────────────────────────────────────── */}
        <Row>
          <DashboardHeader
            onRefresh={refresh}
            refreshing={refreshing}
            lastUpdated={lastUpdated}
          />
        </Row>

        {/* ── Row 2: Primary Indices ─────────────────────────────── */}
        <Row>
          <PrimaryIndicesWidget
            data={d.indices}
            loading={loading && !d.indices}
            error={sourceStatus('indices') === 'error'}
          />
        </Row>

        {/* ── Row 3: Announcement Hero ───────────────────────────── */}
        <Row>
          <AnnouncementOverviewWidget
            data={d.announcements}
            loading={loading && !d.announcements}
            error={sourceStatus('announcements') === 'error'}
          />
        </Row>

        {/* ── Row 4: Market Movers (Gainers + Losers) ────────────── */}
        <Row>
          <MarketMoversWidget
            data={d.marketMovers}
            loading={loading && !d.marketMovers}
            error={sourceStatus('marketMovers') === 'error'}
          />
        </Row>

        {/* ── Row 5: IPO + Watchlist ─────────────────────────────── */}
        <Row className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <IpoActivityWidget
            data={d.ipo}
            loading={loading && !d.ipo}
            error={sourceStatus('ipo') === 'error'}
          />
          <WatchlistSummaryWidget
            data={d.watchlist}
            loading={loading && !d.watchlist}
            error={sourceStatus('watchlist') === 'error'}
          />
        </Row>

        {/* ── Row 6: Board Meetings + AGM ────────────────────────── */}
        <Row className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <BoardMeetingsWidget
            data={d.boardMeetings}
            loading={loading && !d.boardMeetings}
            error={sourceStatus('boardMeetings') === 'error'}
          />
          <AgmWidget
            data={d.agms}
            loading={loading && !d.agms}
            error={sourceStatus('agms') === 'error'}
          />
        </Row>

        {/* ── Row 7: Volume Spurts + Deals ───────────────────────── */}
        <Row className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <VolumeSpurtWidget
            data={d.volumeSpurts}
            loading={loading && !d.volumeSpurts}
            error={sourceStatus('volumeSpurts') === 'error'}
          />
          <DealsWidget
            data={d.deals}
            loading={loading && !d.deals}
            error={sourceStatus('deals') === 'error'}
          />
        </Row>

        {/* ── Row 8: Announcement Categories ─────────────────────── */}
        <Row>
          <AnnouncementCategoryWidget
            data={d.announcements?.categories}
            loading={loading && !d.announcements}
            error={sourceStatus('announcements') === 'error'}
          />
        </Row>

        {/* ── Row 9: Top Companies + Watchlist Groups ─────────────── */}
        <Row className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <TopWatchlistCompaniesWidget
            data={d.watchlist?.topCompanies}
            loading={loading && !d.watchlist}
          />
          <WatchlistGroupsWidget
            data={d.watchlist?.groups}
            loading={loading && !d.watchlist}
          />
        </Row>
      </motion.div>
    </PageTransition>
  )
}
