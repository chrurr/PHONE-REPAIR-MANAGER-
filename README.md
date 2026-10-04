# BN SMART — Supplier Management Fix

## Included
- Supplier section on the dashboard and near the top of navigation.
- Suppliers: BN SMART, MONTEL, AABIDIN, HASSAN, RAHT ELBAL.
- Quick purchase entry with selectable items: LCD, BAT, NAP CHARGE, GLASS, SERSOU, CONCTOUR.
- LCD subtype selection: ORG, OLD, INSEL.
- Repeated selection increments quantity; + / - controls are available.
- Optional phone model, unit price, paid amount and notes.
- Supplier totals, paid amounts, outstanding balance and purchase history.
- Supplier field removed from new-receipt and edit-receipt forms.
- Existing repair supplier data is preserved in the database for backward compatibility.
- Supplier purchases are included in manager backup.

## Upload
Replace these files in the GitHub repository:
- server.js
- public/index.html
- public/sw.js
- web/public/index.html
- web/public/sw.js

Render will create the `supplier_purchases` table automatically on startup.
