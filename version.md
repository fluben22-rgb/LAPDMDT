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
