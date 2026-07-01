"""
imbbloh Carousell Userbot
Runs as your own Telegram account and automates @CarousellOfficialBot
to create Carousell listings.

Usage (in your Saved Messages):
  /list            – start a new listing
  /done            – finished sending photos, move to details
  /cancel          – abort current listing
"""

import asyncio
import os
import re
import tempfile
from dataclasses import dataclass, field
from typing import Optional

from dotenv import load_dotenv
from telethon import TelegramClient, events
from telethon.tl.custom import Message

load_dotenv()

API_ID   = int(os.environ['TELEGRAM_API_ID'])
API_HASH = os.environ['TELEGRAM_API_HASH']
SESSION  = os.getenv('SESSION_NAME', 'carousell_user')
CAROUSELL_BOT = 'CarousellOfficialBot'

client = TelegramClient(SESSION, API_ID, API_HASH)

# ── Listing session state ──────────────────────────────────────────────────

@dataclass
class ListingSession:
    step: str = 'await_photos'
    photos: list = field(default_factory=list)
    title: Optional[str] = None
    price: Optional[str] = None
    description: Optional[str] = None
    condition: Optional[str] = None

_sessions: dict[int, ListingSession] = {}

def get_session(chat_id: int) -> Optional[ListingSession]:
    return _sessions.get(chat_id)

def new_session(chat_id: int) -> ListingSession:
    s = ListingSession()
    _sessions[chat_id] = s
    return s

def clear_session(chat_id: int):
    _sessions.pop(chat_id, None)

# ── Carousell bot automation ───────────────────────────────────────────────

CONDITION_CHOICES = {
    '1': 'Brand New',
    '2': 'Like New',
    '3': 'Lightly Used',
    '4': 'Well Used',
    '5': 'Heavily Used',
    'new': 'Brand New',
    'brand new': 'Brand New',
    'like new': 'Like New',
    'lightly used': 'Lightly Used',
    'well used': 'Well Used',
    'heavily used': 'Heavily Used',
}


async def _click_button_matching(msg: Message, *keywords: str) -> bool:
    """Click the first inline button whose text contains any of the keywords."""
    if not msg.buttons:
        return False
    for row in msg.buttons:
        for btn in row:
            if any(kw.lower() in btn.text.lower() for kw in keywords):
                await btn.click()
                return True
    return False


async def post_to_carousell(session: ListingSession) -> Optional[str]:
    """
    Drive the @CarousellOfficialBot conversation to post a listing draft.

    @CarousellOfficialBot is triggered by a first message whose first line
    is in the format:  Title $Price
    e.g.  "Mario Kart World NS2 $9.90"

    Returns the Carousell listing/edit URL on success, or None.
    """
    async with client.conversation(CAROUSELL_BOT, timeout=120) as conv:

        # ── 1. Trigger draft with "Title $Price" on the first line ─────────
        # Additional context (description) can follow on subsequent lines.
        trigger = f'{session.title} ${session.price}'
        if session.description:
            trigger += f'\n\n{session.description}'
        await conv.send_message(trigger)
        resp: Message = await conv.get_response()

        # If account not linked, surface the bot's message and abort
        lower = resp.raw_text.lower()
        if any(w in lower for w in ('link', 'connect', 'sign in', 'log in')):
            await client.send_message(
                'me',
                '⚠️ *Carousell account not linked yet.*\n\n'
                'Open @CarousellOfficialBot, tap the link button to connect your '
                'Carousell account, then try /list again.',
                parse_mode='md',
            )
            return None

        # ── 2. Send photos ─────────────────────────────────────────────────
        for path in session.photos:
            await conv.send_file(path)
            await asyncio.sleep(0.8)

        # ── 3. Walk through any remaining prompts ──────────────────────────
        for _ in range(15):  # safety cap
            resp = await conv.get_response()
            lower = resp.raw_text.lower()

            # Detect publish / preview screen — click Publish button
            if any(w in lower for w in ('publish', 'post', 'confirm', 'preview', 'draft')):
                clicked = await _click_button_matching(resp, 'publish', 'post', 'confirm', 'draft')
                if not clicked:
                    await conv.send_message('Publish')
                resp = await conv.get_response()
                break

            # Price — in case the bot asks for it separately
            if 'price' in lower and not any(w in lower for w in ('title', 'name')):
                await conv.send_message(session.price)
                continue

            # Condition — try button first, fall back to text
            if 'condition' in lower:
                clicked = await _click_button_matching(resp, session.condition)
                if not clicked:
                    await conv.send_message(session.condition)
                continue

            # Category — pick matching button or default to first
            if 'category' in lower:
                if resp.buttons:
                    await resp.buttons[0][0].click()
                else:
                    await conv.send_message('Video Games')
                continue

            # Description — if asked separately
            if any(w in lower for w in ('description', 'describe', 'detail')):
                await conv.send_message(session.description or session.title)
                continue

            # Unrecognised prompt with buttons — pick first
            if resp.buttons:
                await resp.buttons[0][0].click()

        # ── 4. Extract listing URL from final response ─────────────────────
        text = resp.raw_text
        match = re.search(r'https?://(?:www\.)?carousell\.[a-z.]+/p/\S+', text)
        if match:
            return match.group(0).rstrip('.')

        match = re.search(r'carousell\.[a-z.]+/p/\d+', text)
        if match:
            return 'https://www.' + match.group(0)

        return None

# ── Saved-Messages listener ────────────────────────────────────────────────

@events.register(events.NewMessage(outgoing=True, chats='me'))
async def on_saved_message(event: events.NewMessage.Event):
    chat_id = event.chat_id
    text = (event.raw_text or '').strip()
    s = get_session(chat_id)

    # ── /list ──────────────────────────────────────────────────────────────
    if text == '/list':
        new_session(chat_id)
        await client.send_message(
            'me',
            '📸 *New Carousell Listing*\n\n'
            'Send the item photos here, then type `/done` when finished.\n'
            '_Tip: You can send multiple photos._',
            parse_mode='md',
        )
        return

    # ── /cancel ───────────────────────────────────────────────────────────
    if text == '/cancel':
        clear_session(chat_id)
        await client.send_message('me', '❌ Listing cancelled.')
        return

    if s is None:
        return  # no active session

    # ── Collecting photos ──────────────────────────────────────────────────
    if s.step == 'await_photos':
        if event.photo or event.document:
            path = await event.download_media(tempfile.mktemp(suffix='.jpg'))
            s.photos.append(path)
            await client.send_message(
                'me', f'📷 Photo {len(s.photos)} saved. Send more or type `/done`.',
                parse_mode='md',
            )
            return

        if text == '/done':
            if not s.photos:
                await client.send_message('me', '⚠️ Send at least one photo first.')
                return
            s.step = 'await_title'
            await client.send_message('me', '📝 Enter the *listing title*:', parse_mode='md')
            return

    # ── Title ──────────────────────────────────────────────────────────────
    elif s.step == 'await_title':
        s.title = text
        s.step = 'await_price'
        await client.send_message('me', '💰 Enter the *price* (e.g. `9.90`):', parse_mode='md')

    # ── Price ──────────────────────────────────────────────────────────────
    elif s.step == 'await_price':
        s.price = text
        s.step = 'await_description'
        await client.send_message('me', '📄 Enter the *description*:', parse_mode='md')

    # ── Description ────────────────────────────────────────────────────────
    elif s.step == 'await_description':
        s.description = text
        s.step = 'await_condition'
        await client.send_message(
            'me',
            '🏷️ Select *condition* (type number or name):\n\n'
            '`1` Brand New\n'
            '`2` Like New\n'
            '`3` Lightly Used\n'
            '`4` Well Used\n'
            '`5` Heavily Used',
            parse_mode='md',
        )

    # ── Condition → trigger posting ────────────────────────────────────────
    elif s.step == 'await_condition':
        s.condition = CONDITION_CHOICES.get(text.lower(), text)
        s.step = 'posting'

        await client.send_message(
            'me',
            f'⏳ *Posting to Carousell…*\n\n'
            f'📌 {s.title}\n'
            f'💰 ${s.price}  ·  {s.condition}\n\n'
            f'_(This may take up to 30 seconds)_',
            parse_mode='md',
        )

        try:
            url = await post_to_carousell(s)
            if url:
                await client.send_message(
                    'me',
                    f'✅ *Listing posted!*\n\n🔗 {url}\n\n'
                    f'Tap the link to review the draft on Carousell.',
                    parse_mode='md',
                )
            else:
                await client.send_message(
                    'me',
                    '⚠️ Listing posted but no URL was returned.\n'
                    'Check @CarousellOfficialBot for the result.',
                )
        except asyncio.TimeoutError:
            await client.send_message(
                'me',
                '⏱️ @CarousellOfficialBot took too long to respond.\n'
                'The listing may still have been created — check @CarousellOfficialBot.',
            )
        except Exception as exc:
            await client.send_message('me', f'❌ Error: {exc}')
        finally:
            # Clean up temp photo files
            for path in s.photos:
                try:
                    os.remove(path)
                except OSError:
                    pass
            clear_session(chat_id)


# ── Entry point ────────────────────────────────────────────────────────────

async def main():
    await client.start()
    me = await client.get_me()
    print(f'✅ Logged in as {me.first_name} (@{me.username})')
    print('📝 Open your Telegram Saved Messages and type /list to create a listing.')
    client.add_event_handler(on_saved_message)
    await client.run_until_disconnected()


if __name__ == '__main__':
    asyncio.run(main())
