import { FullPageError, Link } from '@repro/design'
import React from 'react'
import { Link as RouterLink } from 'react-router-dom'

/**
 * Full-page not-found state for unmatched workspace routes. Rendered by the
 * `path="*"` catch-all so users always see a styled error with a way home —
 * never a blank document.
 */
export const NotFoundRoute: React.FC = () => (
  <FullPageError
    title="Page not found"
    description="The page you're looking for doesn't exist or may have moved."
    action={
      <Link component={RouterLink} props={{ to: '/' }}>
        Back to home
      </Link>
    }
  />
)
