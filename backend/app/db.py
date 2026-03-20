import logging
from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings

logger = logging.getLogger(__name__)

client: AsyncIOMotorClient | None = None
db = None


async def connect_db():
    global client, db
    client = AsyncIOMotorClient(
        settings.MONGODB_URL,
        serverSelectionTimeoutMS=10_000,
        connectTimeoutMS=10_000,
    )
    db = client[settings.MONGODB_DB]
    # Create indexes (non-fatal if Atlas is slow on first connect)
    try:
        await db.users.create_index("mobile", unique=True)
        await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])
        await db.connection_requests.create_index([("to_user_id", 1), ("status", 1)])
        await db.connection_requests.create_index([("from_user_id", 1)])
        await db.read_marks.create_index([("user_id", 1), ("conversation_id", 1)], unique=True)
        # Stories / Status index: expire after 24h
        await db.status.create_index("expires_at", expireAfterSeconds=0)
        await db.status.create_index("user_id")
        logger.info("MongoDB indexes ensured.")
    except Exception as e:
        logger.warning(f"Could not create indexes (will retry on next start): {e}")


async def close_db():
    global client
    if client:
        client.close()


def get_db():
    return db
