import { Block } from '@jsxstyle/react'
import type { Engine, IShapeDrawData, IShapeDrawer } from '@tsparticles/engine'
import { tsParticles } from '@tsparticles/engine'
import { loadAmbientPreset } from '@tsparticles/preset-ambient'
import React, { useEffect, useId } from 'react'

const roundedSquareShape = 'roundedSquare'
const roundedSquareSides = 4

type TsParticlesContainer = {
  destroy?: () => void
  stop?: () => void
}

export type ParticleArtworkPalette = {
  backgroundStart: string
  backgroundEnd: string
  particle: string
  particleAlt: string
  line: string
  glow: string
}

export type ParticleArtworkProps = {
  palette: ParticleArtworkPalette
  seed?: number
}

type ParticleArtworkOptions = {
  background: {
    color: {
      value: string
    }
    image: string
  }
  detectRetina: boolean
  fullScreen: {
    enable: boolean
  }
  interactivity: {
    events: {
      onClick: {
        enable: boolean
        mode: 'push' | 'repulse'
      }
      onHover: {
        enable: boolean
        mode: 'push' | 'repulse'
      }
      resize: boolean
    }
    modes: {
      push: {
        quantity: number
      }
      repulse: {
        distance: number
        duration: number
      }
    }
  }
  particles: {
    color: {
      value: string[]
    }
    links: {
      color: string
      distance: number
      enable: boolean
      opacity: number
    }
    move: {
      enable: boolean
      outModes: {
        default: 'out'
      }
      speed: number
    }
    number: {
      density: {
        enable: boolean
        area: number
      }
      value: number
    }
    opacity: {
      value: number
    }
    size: {
      value: {
        min: number
        max: number
      }
    }
    shape: {
      type: typeof roundedSquareShape
      options: {
        roundedSquare: Array<{
          particles: {
            opacity: {
              value: {
                min: number
                max: number
              }
              animation: {
                enable: boolean
                speed: number
              }
            }
            paint: {
              fill?: {
                enable: boolean
                color?: {
                  value: string
                }
              }
              stroke?: {
                width: number
                color: {
                  value: string
                }
              }
            }
            size: {
              value: {
                min: number
                max: number
              }
            }
          }
        }>
      }
    }
  }
  preset: 'ambient'
  seed: number
}

let ambientPresetPromise: Promise<void> | null = null

const roundedSquareDrawer: IShapeDrawer = {
  draw({ context, radius }: IShapeDrawData) {
    const size = radius * 2
    const x = -radius
    const y = -radius
    const cornerRadius = Math.min(radius * 0.38, 5)

    context.moveTo(x + cornerRadius, y)
    context.lineTo(x + size - cornerRadius, y)
    context.quadraticCurveTo(x + size, y, x + size, y + cornerRadius)
    context.lineTo(x + size, y + size - cornerRadius)
    context.quadraticCurveTo(
      x + size,
      y + size,
      x + size - cornerRadius,
      y + size
    )
    context.lineTo(x + cornerRadius, y + size)
    context.quadraticCurveTo(x, y + size, x, y + size - cornerRadius)
    context.lineTo(x, y + cornerRadius)
    context.quadraticCurveTo(x, y, x + cornerRadius, y)
  },
  getSidesCount() {
    return roundedSquareSides
  },
}

async function loadRoundedSquareShape(engine: Engine) {
  await engine.pluginManager.register(e => {
    e.pluginManager.addShape([roundedSquareShape], () => {
      return Promise.resolve(roundedSquareDrawer)
    })
  })
}

function ensureAmbientPresetLoaded() {
  if (!ambientPresetPromise) {
    ambientPresetPromise = loadAmbientPreset(tsParticles)
      .then(() => loadRoundedSquareShape(tsParticles))
      .catch(error => {
        ambientPresetPromise = null
        throw error
      })
  }

  return ambientPresetPromise
}

function destroyParticles(container: TsParticlesContainer | null) {
  if (!container) {
    return
  }

  if (typeof container.destroy === 'function') {
    container.destroy()
    return
  }

  container.stop?.()
}

function createParticleArtworkOptions(
  palette: ParticleArtworkPalette,
  seed: number
): ParticleArtworkOptions {
  return {
    background: {
      color: {
        value: palette.backgroundStart,
      },
      image: `linear-gradient(135deg, ${palette.backgroundStart} 0%, ${palette.backgroundEnd} 62%, ${palette.glow} 100%)`,
    },
    detectRetina: true,
    fullScreen: {
      enable: false,
    },
    interactivity: {
      events: {
        onClick: {
          enable: true,
          mode: 'push',
        },
        onHover: {
          enable: true,
          mode: 'repulse',
        },
        resize: true,
      },
      modes: {
        push: {
          quantity: 2,
        },
        repulse: {
          distance: 88,
          duration: 0.32,
        },
      },
    },
    particles: {
      color: {
        value: [palette.particle, palette.particleAlt],
      },
      links: {
        color: palette.line,
        distance: 128,
        enable: true,
        opacity: 0.16,
      },
      move: {
        enable: true,
        outModes: {
          default: 'out',
        },
        speed: 0.35,
      },
      number: {
        density: {
          enable: true,
          area: 720,
        },
        value: 2400,
      },
      opacity: {
        value: 0.72,
      },
      size: {
        value: {
          min: 0.6,
          max: 4.8,
        },
      },
      shape: {
        type: roundedSquareShape,
        options: {
          roundedSquare: [
            {
              particles: {
                paint: {
                  fill: {
                    enable: false,
                  },
                  stroke: {
                    width: 1,
                    color: {
                      value: palette.particle,
                    },
                  },
                },
                opacity: {
                  value: { min: 0, max: 0.8 },
                  animation: {
                    enable: true,
                    speed: 0.1,
                  },
                },
                size: {
                  value: { min: 1.5, max: 6.5 },
                },
              },
            },
            {
              particles: {
                paint: {
                  fill: {
                    color: {
                      value: palette.particleAlt,
                    },
                    enable: true,
                  },
                },
                opacity: {
                  value: { min: 0, max: 0.6 },
                  animation: {
                    enable: true,
                    speed: 0.1,
                  },
                },
                size: {
                  value: { min: 3, max: 10 },
                },
              },
            },
            {
              particles: {
                paint: {
                  fill: {
                    color: {
                      value: palette.glow,
                    },
                    enable: true,
                  },
                },
                opacity: {
                  value: { min: 0, max: 0.4 },
                  animation: {
                    enable: true,
                    speed: 0.1,
                  },
                },
                size: {
                  value: { min: 8, max: 24 },
                },
              },
            },
          ],
        },
      },
    },
    preset: 'ambient',
    seed,
  }
}

export function ParticleArtwork({ palette, seed = 1 }: ParticleArtworkProps) {
  const reactId = useId()
  const containerId = `particle-artwork-${reactId.replace(/:/g, '-')}`

  useEffect(() => {
    let cancelled = false
    let container: TsParticlesContainer | null = null

    void (async () => {
      try {
        await ensureAmbientPresetLoaded()

        if (cancelled) {
          return
        }

        container = (await tsParticles.load({
          id: containerId,
          options: createParticleArtworkOptions(palette, seed),
        })) as TsParticlesContainer

        if (cancelled) {
          destroyParticles(container)
          container = null
        }
      } catch {
        if (!cancelled) {
          destroyParticles(container)
        }
      }
    })()

    return () => {
      cancelled = true
      destroyParticles(container)
    }
  }, [containerId, palette, seed])

  return (
    <Block
      height="100%"
      overflow="hidden"
      position="relative"
      width="100%"
      props={{ 'aria-hidden': true } as React.HTMLAttributes<HTMLDivElement>}
    >
      <Block
        height="100%"
        id={containerId}
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        width="100%"
        props={
          {
            'data-testid': 'particle-artwork-root',
          } as React.HTMLAttributes<HTMLDivElement>
        }
      />
    </Block>
  )
}
