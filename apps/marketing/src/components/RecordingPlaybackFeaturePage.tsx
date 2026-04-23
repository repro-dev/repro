'use client'

// jsxstyle requires a client boundary because it injects styles via React context.

import { Block, Col, Grid, Row } from '@jsxstyle/react'
import {
  color,
  focusRing,
  radius,
  spacing,
  textStyles,
  transition,
} from '@repro/design'
import type { ReactNode } from 'react'
import React from 'react'

void React

const CHROME_WEB_STORE_URL =
  'https://chrome.google.com/webstore/detail/repro/ecmbphfjfhnifmhbjhpejbpdnpanpice'

const PANEL_BORDER = `1px solid ${color.border.default}`
const PANEL_BORDER_STRONG = `1px solid ${color.border.strong}`

type RecordingPlaybackFeaturePageProps = {
  appUrl: string
}

type CtaLinkProps = {
  href: string
  tone: 'solid' | 'outline'
  children: ReactNode
}

function CtaLink({ href, tone, children }: CtaLinkProps) {
  const isSolid = tone === 'solid'

  return (
    <Block
      component="a"
      props={{ href }}
      {...textStyles.label}
      color={isSolid ? color.text.inverse : color.text.default}
      textDecoration="none"
      backgroundColor={isSolid ? color.info : color.bg.surface}
      border={isSolid ? '1px solid transparent' : PANEL_BORDER}
      borderRadius={radius.md}
      paddingTop={spacing.sm}
      paddingBottom={spacing.sm}
      paddingLeft={spacing.lg}
      paddingRight={spacing.lg}
      transition={transition.default}
      hoverBackgroundColor={isSolid ? color.primaryHover : color.bg.hover}
      hoverBorderColor={isSolid ? color.info : color.border.strong}
      {...focusRing()}
    >
      {children}
    </Block>
  )
}

function SectionHeading({ title, body }: { title: string; body: ReactNode }) {
  return (
    <Col gap={spacing.sm} maxWidth="46rem">
      <Block component="h2" {...textStyles.heading2} color={color.text.default}>
        {title}
      </Block>

      <Block component="p" {...textStyles.body} color={color.text.secondary}>
        {body}
      </Block>
    </Col>
  )
}

function CaptureLane({
  label,
  detail,
  accentWidth,
}: {
  label: string
  detail: string
  accentWidth: string
}) {
  return (
    <Row alignItems="center" gap={spacing.sm}>
      <Block
        component="span"
        {...textStyles.caption}
        color={color.text.default}
        width="9rem"
        flexShrink={0}
      >
        {label}
      </Block>

      <Col gap={spacing.xs} flex="1" minWidth={0}>
        <Block
          borderRadius={radius.full}
          height="0.5rem"
          width={accentWidth}
          backgroundColor={color.info}
        />

        <Block
          component="span"
          {...textStyles.caption}
          color={color.text.secondary}
        >
          {detail}
        </Block>
      </Col>
    </Row>
  )
}

function DevToolsPanel({
  title,
  body,
  compact = false,
}: {
  title: string
  body: ReactNode
  compact?: boolean
}) {
  return (
    <Col
      gap={spacing.sm}
      padding={compact ? spacing.md : spacing.lg}
      border={PANEL_BORDER}
      backgroundColor={color.bg.surface}
      borderRadius={radius.lg}
    >
      <Block component="span" {...textStyles.label} color={color.text.default}>
        {title}
      </Block>

      <Block
        component="p"
        {...textStyles.bodySmall}
        color={color.text.secondary}
      >
        {body}
      </Block>
    </Col>
  )
}

export function RecordingPlaybackFeaturePage({
  appUrl,
}: RecordingPlaybackFeaturePageProps) {
  return (
    <Col gap={spacing['4xl']}>
      <Col component="section" gap={spacing.lg} maxWidth="48rem">
        <Block component="p" {...textStyles.label} color={color.info}>
          Recording and playback
        </Block>

        <Block
          component="h1"
          {...textStyles.heading1}
          color={color.text.default}
        >
          Capture the bug, then replay the session
        </Block>

        <Block component="p" {...textStyles.body} color={color.text.secondary}>
          Repro records the exact sequence of DOM changes, interactions, network
          activity, console output, and performance metrics in one seekable
          session.
        </Block>
      </Col>

      <Col component="section" gap={spacing.xl}>
        <SectionHeading
          title="Recording"
          body={
            <>
              Binary encoding keeps payloads small. A ring buffer holds the live
              stream, and periodic snapshots make the session easy to seek.
            </>
          }
        />

        <Grid
          gap={spacing.lg}
          gridTemplateColumns="minmax(0, 1.05fr) minmax(320px, 0.95fr)"
        >
          <Col gap={spacing.md} maxWidth="42rem">
            <Block
              component="p"
              {...textStyles.body}
              color={color.text.secondary}
            >
              We capture DOM mutations, interactions, XHR and Fetch requests,
              WebSocket traffic, console output, and performance metrics as the
              session unfolds.
            </Block>

            <Col gap={spacing.sm}>
              <Block
                component="p"
                {...textStyles.label}
                color={color.text.default}
              >
                Capture lanes
              </Block>

              <Block
                component="p"
                {...textStyles.bodySmall}
                color={color.text.secondary}
              >
                Each lane feeds the same binary stream, so the browser only
                keeps what it needs to reconstruct the moment later.
              </Block>

              <Col gap={spacing.sm}>
                <CaptureLane
                  label="DOM mutations"
                  detail="Tree diffs preserve structural changes without saving every repaint."
                  accentWidth="92%"
                />
                <CaptureLane
                  label="Interactions"
                  detail="Pointer, keyboard, and focus events preserve the user's path."
                  accentWidth="84%"
                />
                <CaptureLane
                  label="Network"
                  detail="XHR, Fetch, and WebSocket activity stay attached to the timeline."
                  accentWidth="76%"
                />
                <CaptureLane
                  label="Console"
                  detail="Warnings and errors travel with the same session state."
                  accentWidth="68%"
                />
                <CaptureLane
                  label="Performance"
                  detail="Long tasks and layout churn point to the slowdown."
                  accentWidth="60%"
                />
              </Col>
            </Col>
          </Col>

          <Col
            gap={spacing.md}
            padding={spacing.lg}
            border={PANEL_BORDER}
            backgroundColor={color.bg.surface}
            borderRadius={radius.lg}
          >
            <Row
              justifyContent="space-between"
              alignItems="baseline"
              gap={spacing.sm}
            >
              <Block
                component="span"
                {...textStyles.label}
                color={color.text.default}
              >
                Binary event stream
              </Block>

              <Block
                component="span"
                {...textStyles.caption}
                color={color.text.secondary}
              >
                ring buffer + snapshots
              </Block>
            </Row>

            <Col gap={spacing.sm}>
              <Block
                backgroundColor={color.bg.subtle}
                borderRadius={radius.md}
                padding={spacing.md}
                border={PANEL_BORDER}
              >
                <Row
                  justifyContent="space-between"
                  gap={spacing.sm}
                  alignItems="center"
                >
                  <Block
                    component="span"
                    {...textStyles.caption}
                    color={color.text.secondary}
                  >
                    live stream
                  </Block>

                  <Block
                    component="span"
                    {...textStyles.caption}
                    color={color.text.default}
                  >
                    snapshot every few seconds
                  </Block>
                </Row>
              </Block>

              <CaptureLane
                label="DOM"
                detail="Diffs land first, then snapshots anchor the seek point."
                accentWidth="88%"
              />
              <CaptureLane
                label="Events"
                detail="Interactions are recorded in order, not as a separate log."
                accentWidth="72%"
              />
              <CaptureLane
                label="Network"
                detail="Requests stay linked to the exact frame that triggered them."
                accentWidth="80%"
              />
              <CaptureLane
                label="Console"
                detail="The same playback timeline replays messages at the right moment."
                accentWidth="64%"
              />
            </Col>

            <Block
              component="p"
              {...textStyles.bodySmall}
              color={color.text.secondary}
            >
              Periodic snapshots keep the ring buffer seekable even when the
              user jumps far back in time.
            </Block>
          </Col>
        </Grid>

        <Col
          gap={spacing.sm}
          padding={spacing.lg}
          border={PANEL_BORDER}
          backgroundColor={color.bg.subtle}
          borderRadius={radius.lg}
        >
          <Block
            component="h3"
            {...textStyles.heading3}
            color={color.text.default}
          >
            What stays out of the recording
          </Block>

          <Block
            component="p"
            {...textStyles.bodySmall}
            color={color.text.secondary}
          >
            Password values, clipboard contents, and other sensitive fields stay
            out by default. Captured data is encrypted in transit and at rest,
            and your workspace controls how long it is retained.
          </Block>
        </Col>
      </Col>

      <Col component="section" gap={spacing.xl}>
        <SectionHeading
          title="Playback"
          body={
            <>
              Repro reconstructs the session inside a sandboxed iframe so you
              can inspect the UI exactly as it appeared when the bug happened.
            </>
          }
        />

        <Grid
          gap={spacing.lg}
          gridTemplateColumns="minmax(320px, 0.95fr) minmax(0, 1.05fr)"
        >
          <Col
            gap={spacing.md}
            padding={spacing.lg}
            border={PANEL_BORDER}
            backgroundColor={color.bg.surface}
            borderRadius={radius.lg}
          >
            <Row gap={spacing.sm} flexWrap="wrap">
              <Block
                component="span"
                {...textStyles.caption}
                color={color.text.inverse}
                backgroundColor={color.info}
                borderRadius={radius.full}
                paddingTop={spacing.xs}
                paddingBottom={spacing.xs}
                paddingLeft={spacing.sm}
                paddingRight={spacing.sm}
              >
                Pause
              </Block>
              <Block
                component="span"
                {...textStyles.caption}
                color={color.text.default}
                border={PANEL_BORDER}
                borderRadius={radius.full}
                paddingTop={spacing.xs}
                paddingBottom={spacing.xs}
                paddingLeft={spacing.sm}
                paddingRight={spacing.sm}
              >
                Seek
              </Block>
              <Block
                component="span"
                {...textStyles.caption}
                color={color.text.default}
                border={PANEL_BORDER}
                borderRadius={radius.full}
                paddingTop={spacing.xs}
                paddingBottom={spacing.xs}
                paddingLeft={spacing.sm}
                paddingRight={spacing.sm}
              >
                2x speed
              </Block>
              <Block
                component="span"
                {...textStyles.caption}
                color={color.text.default}
                border={PANEL_BORDER}
                borderRadius={radius.full}
                paddingTop={spacing.xs}
                paddingBottom={spacing.xs}
                paddingLeft={spacing.sm}
                paddingRight={spacing.sm}
              >
                Breakpoints
              </Block>
            </Row>

            <Block
              padding={spacing.md}
              border={PANEL_BORDER}
              borderRadius={radius.md}
              backgroundColor={color.bg.subtle}
            >
              <Row
                justifyContent="space-between"
                gap={spacing.sm}
                alignItems="center"
              >
                <Block
                  component="span"
                  {...textStyles.label}
                  color={color.text.default}
                >
                  Pixel-perfect DOM reconstruction
                </Block>

                <Block
                  component="span"
                  {...textStyles.caption}
                  color={color.text.secondary}
                >
                  offline playback supported
                </Block>
              </Row>

              <Block
                component="p"
                {...textStyles.bodySmall}
                color={color.text.secondary}
                marginTop={spacing.sm}
              >
                The browser rebuilds the captured DOM inside a sandboxed iframe,
                so you can step through the same screen, pause at a breakpoint,
                scrub the range selector, and keep going even without a live
                connection.
              </Block>
            </Block>
          </Col>

          <Col gap={spacing.md}>
            <Block
              component="p"
              {...textStyles.body}
              color={color.text.secondary}
            >
              Timeline controls let you move from the first interaction to the
              exact failure point without losing the surrounding state.
            </Block>

            <Col gap={spacing.sm}>
              <Block
                component="p"
                {...textStyles.label}
                color={color.text.default}
              >
                Timeline concepts
              </Block>

              <Col gap={spacing.sm}>
                <CaptureLane
                  label="Pause"
                  detail="Freeze the stream at the failure point to inspect the DOM."
                  accentWidth="90%"
                />
                <CaptureLane
                  label="Seek"
                  detail="Jump between snapshots and the intervening event stream."
                  accentWidth="82%"
                />
                <CaptureLane
                  label="Speed"
                  detail="Move faster when you only need to scan the surrounding path."
                  accentWidth="74%"
                />
                <CaptureLane
                  label="Range"
                  detail="Select the exact slice of the session you want to review."
                  accentWidth="66%"
                />
              </Col>
            </Col>
          </Col>
        </Grid>
      </Col>

      <Col component="section" gap={spacing.xl}>
        <SectionHeading
          title="DevTools integration"
          body={
            <>
              Elements, Network, and Console stay open beside the replay, while
              an upcoming Performance panel will surface the slowdowns that
              matter.
            </>
          }
        />

        <Grid
          gap={spacing.lg}
          gridTemplateColumns="minmax(0, 1.2fr) minmax(320px, 0.8fr)"
        >
          <Col
            gap={spacing.md}
            padding={spacing.lg}
            border={PANEL_BORDER_STRONG}
            backgroundColor={color.bg.surface}
            borderRadius={radius.lg}
          >
            <Row
              justifyContent="space-between"
              alignItems="center"
              gap={spacing.sm}
            >
              <Block
                component="span"
                {...textStyles.label}
                color={color.text.default}
              >
                Elements
              </Block>

              <Block
                component="span"
                {...textStyles.caption}
                color={color.text.secondary}
              >
                sandboxed iframe
              </Block>
            </Row>

            <Col gap={spacing.xs}>
              <Block
                component="span"
                {...textStyles.bodySmall}
                color={color.text.default}
              >
                &lt;article&gt; Checkout failed
              </Block>
              <Block
                component="span"
                {...textStyles.bodySmall}
                color={color.text.secondary}
              >
                &nbsp;&nbsp;&lt;button&gt; Retry payment
              </Block>
              <Block
                component="span"
                {...textStyles.bodySmall}
                color={color.text.secondary}
              >
                &nbsp;&nbsp;&lt;section&gt; Request details
              </Block>
              <Block
                component="span"
                {...textStyles.bodySmall}
                color={color.text.secondary}
              >
                &nbsp;&nbsp;&lt;aside&gt; Network trace
              </Block>
            </Col>

            <Block
              component="p"
              {...textStyles.bodySmall}
              color={color.text.secondary}
            >
              You can inspect the rebuilt DOM tree while the captured session
              keeps moving underneath it.
            </Block>
          </Col>

          <Col gap={spacing.sm}>
            <DevToolsPanel
              title="Network"
              body="Request timing, status codes, and payloads stay attached to the same moment in the replay."
            />
            <DevToolsPanel
              title="Console"
              body="Warnings, errors, and logs make the bug reproducible without a second tab."
            />
            <DevToolsPanel
              title="Performance"
              compact
              body="Upcoming support will surface long tasks, layout shifts, and paint bottlenecks."
            />
          </Col>
        </Grid>
      </Col>

      <Col
        component="section"
        gap={spacing.lg}
        paddingTop={spacing.xl}
        borderTop={PANEL_BORDER}
      >
        <Col gap={spacing.sm} maxWidth="46rem">
          <Block
            component="h2"
            {...textStyles.heading2}
            color={color.text.default}
          >
            Ready to try it?
          </Block>

          <Block
            component="p"
            {...textStyles.body}
            color={color.text.secondary}
          >
            Start a session in the app, or install the extension to capture the
            next bug as it happens.
          </Block>
        </Col>

        <Row gap={spacing.md} flexWrap="wrap">
          <CtaLink href={appUrl} tone="solid">
            Try it free
          </CtaLink>

          <CtaLink href={CHROME_WEB_STORE_URL} tone="outline">
            Install extension
          </CtaLink>
        </Row>
      </Col>
    </Col>
  )
}
