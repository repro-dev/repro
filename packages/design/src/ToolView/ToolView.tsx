import { Grid } from '@jsxstyle/react'
import React from 'react'
import { color } from '../tokens/colors'

export interface ToolViewProps {
  children?: React.ReactNode
}

/**
 * Full-screen tool shell for immersive experiences like session replay.
 *
 * Renders a full-viewport CSS Grid with a compact header bar and a
 * full-bleed content area. This is a sibling shell to `AppShell` — the
 * sidebar is hidden and the tool gets maximum viewport space.
 *
 * @example
 *   <ToolView>
 *     <ToolView.Header>
 *       <Link to="/sessions">Back</Link>
 *       <span>Recording Title</span>
 *     </ToolView.Header>
 *     <ToolView.Content>
 *       <DevTools />
 *     </ToolView.Content>
 *   </ToolView>
 */
export const ToolView: React.FC<ToolViewProps> = ({ children }) => {
  return (
    <Grid
      height="100dvh"
      gridTemplateRows="auto 1fr"
      backgroundColor={color.bg.surface}
    >
      {children}
    </Grid>
  )
}
