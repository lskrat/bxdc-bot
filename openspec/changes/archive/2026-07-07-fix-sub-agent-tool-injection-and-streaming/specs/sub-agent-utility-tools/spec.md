## ADDED Requirements

### Requirement: Utility tools default injection for sub-agents
The system SHALL automatically inject file_list, file_read, and file_write as utility tools into every sub-agent, independent of vector search matching.

#### Scenario: Sub-agent receives utility tools
- **WHEN** execute_skill_with_context creates a sub-agent
- **THEN** the sub-agent's tool list SHALL include file_list, file_read, and file_write regardless of vector search results

#### Scenario: Vector search does not override utility tools
- **WHEN** autoSearchSkills returns business-matched skills and utility skills are pre-cached
- **THEN** utility skills SHALL be merged into the final skill list without duplication

### Requirement: Utility skills global caching
The system SHALL pre-fetch and cache utility skills (file_list, file_read, file_write) from Gateway at agent-core startup to avoid per-request embedding API latency.

#### Scenario: Utility skills cached at startup
- **WHEN** agent-core service starts
- **THEN** utility skill metadata SHALL be fetched from Gateway and cached in memory for all subsequent sub-agent executions

#### Scenario: Cache fallback on Gateway failure
- **WHEN** Gateway is unavailable during utility skills pre-fetch
- **THEN** the system SHALL log a warning and fall back to the vector search path for utility tools on each sub-agent request

### Requirement: file_write creates new file when fileRef does not exist
When file_write receives a fileRef that does not correspond to an existing file, the system SHALL infer the file extension from request parameters and create a new file instead of returning an error.

#### Scenario: Create new text file
- **WHEN** file_write is called with fileRef="newfile.txt" and the file does not exist
- **THEN** a new .txt file SHALL be created with the provided content

#### Scenario: Create new file with inferred extension
- **WHEN** file_write is called with fileRef that does not exist and no explicit extension can be determined from fileRef
- **THEN** the system SHALL infer the extension from request parameters (e.g., content structure hints) and create the file accordingly
