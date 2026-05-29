All for PremierOne Records:
[X] Ensure exporting employee attendence records works
[] Make a SQL function that'll reset all rows with the is_present col to false, the rows with out_time,  in_time, and callsign to null
[X] Ensure attendence flows work correctly

entire codebase:
[X] make sure comments on important stuff i gotta remember

misc:
[] Redo manual


----------------------------------------------------------------
Overhaul:

[] Outlook
  [] Will ask for login with creds
  [] Upon login, will show a outlook styled display with all your emails
  [] Nobody will have a PFP, instead a default
  [] Impliment following categories:
    [] Dropdown w/ text "Favorites"
      [] Inbox
      [] Sent Itmes
      [] Drafts (ref query drafts for this)
    [] Dropdown of current email
      [] Inbox (sub of focused and other)
      [] Drafts
      [] Sent Items
      [] Deleted
      [] Junk Mail
      [] Notes
      [] Archive
  [] If you login under admin@lapd.org it'll show all emails
  [] In email view allow following:
    [] Delete
    [] Archive
    [] Reply
    [] Reply All
    [] Forward
    [] Read / Unread
    [] View in light mode (ew 🤮)
  [] In new mail have these fields:
    [] To
    [] CC
    [] Subject
    [] Text (with md formatting)
  [] New mail functions
    [] Top Bar
      [] Change to heading (#, ##, etc)
      [] Change to bold (** and **)
      [] Change to italics (* and *)
      [] Chagne to sub heading (-#)
      [] Mark email as important
      [] Attach signature (allow configuration in little arrow)
    [] Main body bar
      [] Send
      [] Delete Draft
  [] Have following at bottom:
    [] tabs of open emails
    [] Always have a tab if no email was openeded but draft saying "Select an item to read"
  [] Sync to table called emails with these collums:
    - sent_by
    - timetsamp_of_sent
    - to (arr)
    - cc (arr)
    - body
    - replys_users (arr)
    - replys_bodys (arr)
    - is_important
    - deleted_by (arr)
    - forwarded_to (arr)
    - archived_by (arr)
    - id




====== maybe in future =======

-- Communtiy Owner / Manager --
1. In supabase, table of all communities, their ids, and a login to community manager portal
2. In communtiy manager portal, you can view all of the people under your community
3. You can revoke access to people in your community, add access, create new community portal members, and more
4. Tables get changed to have "-[community id]" and defined in the code

-- Client (officer) --
1. In windows screen, youll input the community id instead of a shop #
2. Upon logging into your community, it'll set a client var of your community name and will tell the server to request a login from that community
3. In "users" table, everybody will have a collum called "community-id" to show what community they are apart of

^ MAYBE IN THE NEVER WHATTT