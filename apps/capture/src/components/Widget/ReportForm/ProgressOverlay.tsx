import { Block, Col, Row } from '@jsxstyle/react'
import {
  Button,
  Card,
  Meter,
  color,
  fontSize,
  fontWeight,
  lineHeight,
  spacing,
} from '@repro/design'
import { UploadProgress, UploadStage } from '@repro/recording-api'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CopyIcon,
  CornerUpLeftIcon,
} from 'lucide-react'
import React, { Fragment } from 'react'

interface Props {
  progress: UploadProgress
  projectId: string | null
  width?: string | number
  onClose: () => void
}

const Backdrop: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  <Row
    alignItems="center"
    justifyContent="center"
    position="absolute"
    top={0}
    left={0}
    bottom={0}
    right={0}
    backgroundColor={color.bg.overlay}
    backdropFilter="blur(5px)"
    borderRadius={4}
  >
    {children}
  </Row>
)

const Label: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  return (
    <Block
      marginBottom={spacing.md}
      fontSize={fontSize.sm}
      lineHeight={lineHeight.tight}
    >
      {children}
    </Block>
  )
}

const List: React.FC<React.PropsWithChildren<{ width?: string | number }>> = ({
  children,
  width,
}) => (
  <Col gap={spacing.xl} width={width}>
    {children}
  </Col>
)

const ListItem: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  <Block>{children}</Block>
)

export const ProgressOverlay: React.FC<Props> = ({
  progress,
  projectId,
  onClose,
  width = 240,
}) => {
  const recordingUrl =
    projectId && progress.recordingId
      ? `${process.env.REPRO_APP_URL}/projects/${projectId}/recordings/${progress.recordingId}`
      : null

  function copyToClipboard() {
    if (recordingUrl) {
      navigator.clipboard.writeText(recordingUrl)
    }
  }

  return (
    <Backdrop>
      <Card shadow="md">
        {progress.error && (
          <Col gap={spacing.lg}>
            <Row alignItems="center" gap={spacing.lg}>
              <AlertTriangleIcon size={32} color={color.danger} />
              <Block>
                <Block
                  fontSize={fontSize.xs}
                  fontWeight={fontWeight.bold}
                  color={color.text.default}
                  textTransform="uppercase"
                >
                  Could not create recording
                </Block>

                <Row
                  gap={spacing.sm}
                  alignItems="center"
                  fontSize={fontSize.base}
                  marginTop={spacing.lg}
                >
                  {progress.error.message}
                </Row>
              </Block>
            </Row>
            <Block alignSelf="center">
              <Button variant="text" onClick={onClose}>
                <CornerUpLeftIcon size={16} /> Return To Page
              </Button>
            </Block>
          </Col>
        )}

        {progress.completed && !progress.error && (
          <Col gap={spacing.lg}>
            <Row alignItems="center" gap={spacing.lg}>
              <CheckCircle2Icon size={32} color={color.success} />
              <Block
                fontSize={fontSize.xs}
                fontWeight={fontWeight.bold}
                color={color.text.default}
                textTransform="uppercase"
              >
                Recording Created
              </Block>
            </Row>
            <Row gap={spacing.md} justifyContent="center">
              {recordingUrl && (
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => window.open(recordingUrl, '_blank')}
                >
                  Open in Repro
                </Button>
              )}
              <Button
                variant="outlined"
                context="info"
                size="small"
                disabled={!recordingUrl}
                onClick={copyToClipboard}
              >
                <CopyIcon size={18} />
              </Button>
            </Row>
            <Block alignSelf="center">
              <Button variant="text" onClick={onClose}>
                <CornerUpLeftIcon size={16} /> Return To Page
              </Button>
            </Block>
          </Col>
        )}

        {!progress.completed && (
          <Fragment>
            <Block
              fontSize={fontSize.xs}
              fontWeight={fontWeight.bold}
              color={color.text.default}
              textTransform="uppercase"
            >
              Uploading Recording
            </Block>
            <Block marginTop={spacing.xl}>
              <List width={width}>
                <ListItem>
                  <Label>Saving recording details</Label>
                  <Meter
                    min={0}
                    max={1}
                    value={progress.stages[UploadStage.CreateRecording]}
                  />
                </ListItem>

                <ListItem>
                  <Label>Saving events</Label>
                  <Meter
                    min={0}
                    max={1}
                    value={progress.stages[UploadStage.SaveEvents]}
                  />
                </ListItem>

                <ListItem>
                  <Label>Reading resources</Label>
                  <Meter
                    min={0}
                    max={1}
                    value={progress.stages[UploadStage.ReadResources]}
                  />
                </ListItem>

                <ListItem>
                  <Label>Uploading resources</Label>
                  <Meter
                    min={0}
                    max={1}
                    value={progress.stages[UploadStage.SaveResources]}
                  />
                </ListItem>
              </List>
            </Block>
          </Fragment>
        )}
      </Card>
    </Backdrop>
  )
}
