import { Block, Col, Row } from '@jsxstyle/react'
import { Button, Card, Meter, colors } from '@repro/design'
import { UploadProgress, UploadStage } from '@repro/recording-api'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CopyIcon,
  CornerUpLeftIcon,
} from 'lucide-react'
import React, { Fragment, PropsWithChildren } from 'react'

interface Props {
  progress: UploadProgress
  width?: string | number
  onClose: () => void
}

const Backdrop: React.FC<PropsWithChildren> = ({ children }) => (
  <Row
    alignItems="center"
    justifyContent="center"
    position="absolute"
    top={0}
    left={0}
    bottom={0}
    right={0}
    backgroundColor="rgba(255, 255, 255, 0.15)"
    backdropFilter="blur(5px)"
    borderRadius={4}
  >
    {children}
  </Row>
)

const Label: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <Block marginBottom={8} fontSize={13} lineHeight={1}>
      {children}
    </Block>
  )
}

const List: React.FC<PropsWithChildren<{ width?: string | number }>> = ({
  children,
  width,
}) => (
  <Col gap={16} width={width}>
    {children}
  </Col>
)

const ListItem: React.FC<PropsWithChildren> = ({ children }) => (
  <Block>{children}</Block>
)

export const ProgressOverlay: React.FC<Props> = ({
  progress,
  onClose,
  width = 240,
}) => {
  const recordingUrl = `${process.env.REPRO_APP_URL}/recordings/${progress.recordingId}`

  function copyToClipboard() {
    navigator.clipboard.writeText(recordingUrl)
  }

  return (
    <Backdrop>
      <Card>
        {progress.error && (
          <Col gap={10}>
            <Row alignItems="center" gap={10}>
              <AlertTriangleIcon size={32} color={colors.red['500']} />
              <Block>
                <Block
                  fontSize={11}
                  fontWeight={700}
                  color={colors.slate['900']}
                  textTransform="uppercase"
                >
                  Could not create recording
                </Block>

                <Row gap={5} alignItems="center" fontSize={15} marginTop={10}>
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
          <Col gap={10}>
            <Row alignItems="center" gap={10}>
              <CheckCircle2Icon size={32} color={colors.green['500']} />
              <Block marginRight={10}>
                <Block
                  fontSize={11}
                  fontWeight={700}
                  color={colors.slate['900']}
                  textTransform="uppercase"
                >
                  Recording Created
                </Block>

                <Row
                  component="a"
                  gap={5}
                  alignItems="center"
                  fontSize={15}
                  color={colors.blue['700']}
                  marginTop={5}
                  props={{
                    href: recordingUrl,
                    target: '_blank',
                  }}
                >
                  {recordingUrl}
                </Row>
              </Block>

              <Button
                variant="outlined"
                context="info"
                onClick={copyToClipboard}
              >
                <CopyIcon size={18} /> Copy
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
              fontSize={11}
              fontWeight={700}
              color={colors.slate['900']}
              textTransform="uppercase"
            >
              Uploading Recording
            </Block>
            <Block marginTop={15}>
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
