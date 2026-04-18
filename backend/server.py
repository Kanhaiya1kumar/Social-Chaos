from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# EMERGENT LLM KEY
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

app = FastAPI(title="Social Chaos API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ---------- Models ----------
class KeyArtRequest(BaseModel):
    variant: Optional[str] = Field(
        default=None,
        description="Optional variant label to nudge the composition (e.g. 'night', 'sunset', 'neon').",
    )


class KeyArtResponse(BaseModel):
    id: str
    image_base64: str  # data URI ready for <Image source={{ uri }} />
    mime_type: str
    caption: str
    created_at: str


class ScoreSubmit(BaseModel):
    player_name: str
    score: int


class ScoreEntry(BaseModel):
    id: str
    player_name: str
    score: int
    created_at: str


# ---------- Prompt ----------
BASE_PROMPT = (
    "A high-octane 3D game key art for a mobile game titled 'SOCIAL CHAOS'. "
    "A vibrant, saturated 3D render in Pop Art style. Five distinct, highly stylized, "
    "low-poly ragdoll characters mid-air, colliding in a massive physics-based pile-up "
    "in the center of a chaotic urban playground. One character is wearing a giant "
    "banana suit, launched off a spring-loaded trampoline, dropping a trail of shiny "
    "gold coins. Another character (the mascot) is desperately clinging to a flying, "
    "unstable red rocket with smoke trail. Another flies through the air holding a "
    "giant rubber hammer, another rides a shopping cart down the street. Below them, "
    "a bustling, colorful neon-lit city street with pink, cyan and yellow neon signs, "
    "and a giant pink inflatable 'CHAOS BOMB' about to explode. Explosive comic-style "
    "'POW', 'BAM' and 'BOOM' text bubbles in yellow and orange scattered across the "
    "scene. Bold, bouncy 3D block-letter title 'SOCIAL CHAOS' at the top, glowing with "
    "neon pink (#FF007F) and electric blue (#00F0FF), with heavy 3D extrusion. "
    "Cinematic late-afternoon lighting, dramatic rim light, chromatic accents, "
    "extremely detailed, energetic, Unreal Engine 5 render style, 8k, Fall Guys meets "
    "comic-book vibe. Portrait 9:16 composition optimised for mobile."
)


@api_router.get("/")
async def root():
    return {"service": "Social Chaos", "status": "ok"}


@api_router.get("/health")
async def health():
    return {
        "status": "healthy",
        "llm_key_configured": bool(EMERGENT_LLM_KEY),
        "time": datetime.now(timezone.utc).isoformat(),
    }


@api_router.post("/generate-keyart", response_model=KeyArtResponse)
async def generate_keyart(req: KeyArtRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")

    # Build prompt with optional variant
    prompt = BASE_PROMPT
    if req.variant:
        prompt += (
            f" Additional stylistic direction: lean into a '{req.variant}' mood while "
            "keeping all core characters and chaos intact."
        )

    try:
        # Import here so the app still boots if the lib has issues at cold start
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        session_id = f"social-chaos-{uuid.uuid4()}"
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message="You are a pop-art game key-art image generator.",
        )
        chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(
            modalities=["image", "text"]
        )

        msg = UserMessage(text=prompt)
        text, images = await chat.send_message_multimodal_response(msg)

        if not images:
            raise HTTPException(
                status_code=502,
                detail="Image generation returned no images",
            )

        img = images[0]
        mime = img.get("mime_type", "image/png")
        b64 = img.get("data", "")
        data_uri = f"data:{mime};base64,{b64}"

        record = {
            "id": str(uuid.uuid4()),
            "mime_type": mime,
            "caption": (text or "SOCIAL CHAOS").strip()[:200],
            "variant": req.variant,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        # store metadata only (NOT the full base64) to keep Mongo lean
        await db.keyart_generations.insert_one({**record})

        return KeyArtResponse(
            id=record["id"],
            image_base64=data_uri,
            mime_type=mime,
            caption=record["caption"],
            created_at=record["created_at"],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("generate_keyart failed")
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")


# ---------- Leaderboard ----------
@api_router.post("/scores", response_model=ScoreEntry)
async def submit_score(payload: ScoreSubmit):
    name = (payload.player_name or "").strip()[:12].upper() or "ANON"
    score = max(0, int(payload.score))
    entry = {
        "id": str(uuid.uuid4()),
        "player_name": name,
        "score": score,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.scores.insert_one({**entry})
    return ScoreEntry(**entry)


@api_router.get("/scores/top")
async def top_scores(limit: int = 10):
    limit = max(1, min(50, int(limit)))
    cursor = db.scores.find({}, {"_id": 0}).sort("score", -1).limit(limit)
    items = await cursor.to_list(limit)
    return {"scores": items}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
