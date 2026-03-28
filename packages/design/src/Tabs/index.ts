import { Tab } from './Tab'
import { TabList } from './TabList'
import { TabPanel } from './TabPanel'
import { Tabs as TabsRoot } from './Tabs'

export type { TabProps } from './Tab'
export type { TabListProps } from './TabList'
export type { TabPanelProps } from './TabPanel'
export type { TabsProps } from './Tabs'

export const Tabs = Object.assign(TabsRoot, {
  List: TabList,
  Tab: Tab,
  Panel: TabPanel,
})
