import React from 'react'
import PageTransition from '../Common/PageTransition'
import VolumeSpurtSection from '../GainersLosers/VolumeSpurtSection'

export default function VolumeSpurtPage() {
  return (
    <PageTransition className="space-y-6">
      <VolumeSpurtSection />
    </PageTransition>
  )
}
