# [V. 0.0.5]
###### April 13th, 2026 - Base Release

Entire ppre-release of MDT made, to enter testing very soon!!! :)

# [V. 0.1.0]
##### April 20th, 2026 - The Query Update

1. Querying added!
Can query a person only for now, they are added to the queery table, to query simply press the main aciton query button, the other two take you to the query table. Dispatch can also query.

Queries can be added to an inident using footer buttons or the paperclip icon. They can be viewed from query results sidebar in incident view. A sound will play when any query is made.
2. Incident Edit Button (in footer) now actually does something
Allows you to edit base incident data
3. Fixed some elements not disapearing when clicking certain buttons
4. Made night mode more spec
5. Sidebar and table styles for home been updated to more resemble irl (not 1-1 still, i don't have their icons)
6. Changing your status has been made a dropdown
7. In command bar, if you press up arrow or down arrow you can cycle through commands you ran
8. History now added in officer side as well (in incident sidebar)
9. View indicator now actually changes!
10. Calls advanced view changed to be more "spec" (this is the vie that allows you to see closed calls)
11. Made selecting your watch a dropdown

# [V. 0.1.5]
##### May 12th, 2026

Small fixes folks, mainly for bugs :)

ADDITIONS:
1. The back and forword buttons now actually navigate between pages
2. Can now view vehicles and persons on closed incidents
3. Added incident history for more actions
4. Gave the incident history counter functionality

CHANGES:
1. De-attaching units from incident now handled on server side instead of client to avoid people still being attached on incident close due to enhanced security, sorry about this!
2. Can no longer double close calls by pressing the footer button or using incident close command

FIXES:
1. Dispatch now given elevated permissions to manage units on the server side
2. Modal styles remade in order to mimic how they are in real life
3. Closing a modal should reset most fields (besides vehicle and persons fields, I'll get to it later...)
4. When selecting calls in dark mode it should actually show instead of being nothing
5. Help button in bottom footer now works
6. About button in bottom footer now works
7. Fixed the mystical "ghost" call

# [V. 0.2.0]
##### June 1st, 2026 - Reports + Reworks

ADDITIONS:
1. Upon logging on, now go to a windows homescreen instead of straight to your select application
2. Apps now behave like windows apps
3. Multiple apps added, full list is: Outlook, Google, PremierOne Records, PremierOne MDT, PremierOne CAD, and Notepad
4. In MDT, can now publish reports using the sidebar button on homescreen
5. Publishing reports created on MDT, can view your submitted reports etc
6. PremierOne Records created, most of the information about this is classified 🤫
7. PremierOne CAD created instead of it being baked into the MDT, same as last time
8. Outlook created as a placeholder for a future update
9. Notepad created, simple text editor
10. Google created, i frame of real google no browser bar maybe in future

CHANGES:
1. Accessing the dispatch panel has changed competley
2. Dispatch app bar icon changed to the Motorolla APX 8000
3. Power menu updated
4. Ui changed completly and how handled for this update

FIXES:
1. Minor ui bugs fixed

# [V. 0.2.1]
##### May 31st, 2026 - Mobile Map GPS Patch

ADDITIONS:
1. Added live Roblox vehicle GPS markers on the Mobile Map.
2. Added a GPS Online status with voice playback after MDT login.
3. Added a server-backed GPS list endpoint for loading department units on the map.

CHANGES:
1. Mobile Map now loads all live GPS units instead of only the current unit.
2. Mobile Map reports how many GPS units were loaded.

FIXES:
1. Fixed Mobile Map only showing one tracked unit when multiple department units are online.
2. Fixed the GitHub Pages entry file showing the old MDT.
