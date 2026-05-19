import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { color } from '../tokens'
import { ParticleArtwork } from './ParticleArtwork'

const palette = {
  backgroundStart: color.bg.subtle,
  backgroundEnd: color.bg.surface,
  particle: color.primary,
  particleAlt: color.info,
  line: color.primarySubtle,
  glow: color.successSubtle,
}

describe('ParticleArtwork', () => {
  it('renders a decorative tsParticles mount shell during SSR', () => {
    const html = renderToStaticMarkup(
      <ParticleArtwork palette={palette} seed={17} />
    )

    assert.match(html, /aria-hidden="true"/)
    assert.match(html, /data-testid="particle-artwork-root"/)
    assert.match(html, /id="particle-artwork-/)
  })
})
