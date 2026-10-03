import re

from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.types import Message, ReplyKeyboardRemove
from aiogram.types import User as TgUser

from app.bot import keyboards, texts
from app.db import get_session_factory
from app.services.users import InvalidPhoneError, TelegramProfile, save_phone, upsert_profile

router = Router(name="main")
router.message.filter(F.chat.type == "private")

_JOIN_PAYLOAD = re.compile(r"join_([A-Za-z0-9]{6})")
_JOIN_KEY = "join_code"


def _profile(tg: TgUser) -> TelegramProfile:
    return TelegramProfile(
        telegram_id=tg.id,
        first_name=tg.first_name,
        last_name=tg.last_name,
        username=tg.username,
    )


async def _answer_main(message: Message, state: FSMContext, *, has_phone: bool, intro: str) -> None:
    """Просит телефон, если его нет, иначе показывает кнопки открытия приложения."""
    if has_phone:
        join_code: str | None = (await state.get_data()).get(_JOIN_KEY)
        await message.answer(intro, reply_markup=keyboards.app_keyboard(join_code))
    else:
        await message.answer(
            f"{intro}\n\n{texts.PHONE_REQUEST}", reply_markup=keyboards.phone_keyboard()
        )


@router.message(Command("start"))
async def on_start(message: Message, command: CommandObject, state: FSMContext) -> None:
    tg = message.from_user
    if tg is None:
        return
    # Код держим в FSM (MemoryStorage) до получения телефона. Каждый /start перезаписывает его:
    # без валидного payload старое приглашение не должно «прилипать» к кнопке.
    match = _JOIN_PAYLOAD.fullmatch(command.args) if command.args else None
    await state.update_data({_JOIN_KEY: match.group(1) if match else None})
    async with get_session_factory()() as session:
        user = await upsert_profile(session, _profile(tg))
    await _answer_main(message, state, has_phone=user.phone is not None, intro=texts.START)


@router.message(F.contact)
async def on_contact(message: Message, state: FSMContext) -> None:
    tg = message.from_user
    contact = message.contact
    if tg is None or contact is None:
        return
    if contact.user_id != tg.id:
        await message.answer(texts.FOREIGN_CONTACT, reply_markup=keyboards.phone_keyboard())
        return
    try:
        async with get_session_factory()() as session:
            await save_phone(session, _profile(tg), contact.phone_number)
    except InvalidPhoneError:
        await message.answer(texts.INVALID_PHONE, reply_markup=keyboards.phone_keyboard())
        return
    # Reply-клавиатуру убираем отдельным сообщением: в одном сообщении возможна только одна разметка
    await message.answer(texts.PHONE_SAVED, reply_markup=ReplyKeyboardRemove())
    await _answer_main(message, state, has_phone=True, intro=texts.READY)


@router.message()
async def on_other(message: Message, state: FSMContext) -> None:
    tg = message.from_user
    if tg is None:
        return
    async with get_session_factory()() as session:
        user = await upsert_profile(session, _profile(tg))
    await _answer_main(message, state, has_phone=user.phone is not None, intro=texts.HINT)
