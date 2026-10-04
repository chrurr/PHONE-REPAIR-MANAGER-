# BN SMART — Web Fixes

This package keeps the Android project untouched. It adds customer pickup tracking on the web/backend side.

## New behavior
- Each repair has `customer_received` with timestamp and user.
- The admin can mark a phone as `تم استلامه` or undo it from the repair detail/list.
- Profit is recognized only for repairs where `customer_received = true`.
- Existing legacy `تم التسليم` records are preserved as received during startup migration.
