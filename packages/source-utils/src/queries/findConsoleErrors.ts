// TOOLS for agent:
//
// 1. Timeline Navigator
// * get_events(start_time, end_time, event_types=[])
// * get_events_around(timestamp, window_size)
// * search_events(query, filters)
// Lets the agent explore the recording non-linearly and zoom into relevant periods.
//
// 2. State Inspector
// * get_dom_state(timestamp)
// * get_network_state(timestamp) # pending requests, cache state
// * get_console_context(timestamp, lines_before=10)
// Reconstructs application state at any point in time.
//
// 3. Pattern Detector
// * find_errors() # console errors, network failures, exceptions
// * find_anomalies() # unusually slow requests, memory spikes
// * find_user_frustration() # rage clicks, rapid back/forth
// Automatically surfaces likely problem areas.
//
// 4. Diff Analyzer
// * compare_dom(timestamp1, timestamp2)
// * compare_network_waterfalls(session1, session2)
// Essential for "it worked before" or "only happens sometimes" bugs.
//
// 5. Causal Chain Builder
// * trace_backwards(error_timestamp) # what led to this?
// * trace_forwards(user_action) # what happened after this?
// * find_related_events(event_id, relationship_types)
// Helps establish cause-and-effect relationships.
//
// 6. Code Correlator (if you have source maps)
// * map_error_to_source(error)
// * get_relevant_code(dom_element)
// Bridges the gap between runtime and source code.

import { SourceEventView } from '@repro/domain'
import { List } from '@repro/tdl'
import { isConsoleErrorEvent } from './matchers'

export function findConsoleErrors(
  events: List<SourceEventView>
): List<SourceEventView> {
  const errorList = new List(SourceEventView, [])

  for (let i = 0, len = events.size(); i < len; i++) {
    const event = events.over(i)

    if (event && isConsoleErrorEvent(event)) {
      errorList.append(event)
    }
  }

  return errorList
}
