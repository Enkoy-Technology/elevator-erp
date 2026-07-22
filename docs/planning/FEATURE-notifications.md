# FEATURE: Notifications center

## Goal
Simple in-app inbox so staff see alerts (“quote approved”, “assigned to you”, “service due”) without SMS/email yet.

## In scope
- Per-user notification list (paginated; unread filter)
- Unread count
- Mark one / mark all as read
- Create a notification for a colleague (CEO/ADMIN / Sales / Technical — assignment ping)

## Out of scope
- SMS / email / push
- Preferences / digests
- Real-time websocket (page refresh is enough for now)

## Types
`GENERAL` | `QUOTE` | `ASSIGNMENT` | `MAINTENANCE`

## API
- `GET /v1/notifications`
- `GET /v1/notifications/unread-count`
- `POST /v1/notifications` — send to a user
- `PATCH /v1/notifications/:id/read`
- `POST /v1/notifications/read-all`

## UI
`/notifications` — inbox list + “Send notice” drawer

## Exit criteria
- [x] User sees only their own notifications
- [x] Mark as read works
- [x] Unread count endpoint returns correctly
