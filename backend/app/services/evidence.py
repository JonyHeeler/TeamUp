from base64 import b64decode
from binascii import Error as Base64Error
from io import BytesIO

from PIL import Image, ImageOps

IMAGE_LIMIT = 1_000_000
SOURCE_LIMIT = 8_000_000
BASE64_LIMIT = 4 * ((SOURCE_LIMIT + 2) // 3)
MAX_EVIDENCE = 3
MAX_PIXELS = 40_000_000
IMAGE_FORMATS = ("JPEG", "PNG", "WEBP")


class InvalidEvidence(ValueError):
    pass


def prepare_image(encoded: str) -> bytes:
    try:
        data = b64decode(encoded, validate=True)
        if len(data) > SOURCE_LIMIT:
            raise InvalidEvidence("图片原文件过大")
        with Image.open(BytesIO(data), formats=IMAGE_FORMATS) as source:
            if getattr(source, "is_animated", False):
                raise InvalidEvidence("请上传静态图片")
            if source.width * source.height > MAX_PIXELS:
                raise InvalidEvidence("图片分辨率过高")
            oriented = ImageOps.exif_transpose(source)
            oriented.thumbnail((2560, 2560), Image.Resampling.LANCZOS)
            has_alpha = "A" in oriented.getbands() or "transparency" in oriented.info
            image = oriented.convert("RGBA" if has_alpha else "RGB")
    except InvalidEvidence:
        raise
    except (Base64Error, ValueError, OSError, Image.DecompressionBombError) as exc:
        raise InvalidEvidence("请上传有效的 JPG、PNG 或 WebP 图片") from exc

    while min(image.size) > 0:
        for quality in (92, 82, 70, 58):
            result = BytesIO()
            image.save(result, format="WEBP", quality=quality)
            if result.tell() <= IMAGE_LIMIT:
                return result.getvalue()
        width = max(1, round(image.width * 0.75))
        height = max(1, round(image.height * 0.75))
        if (width, height) == image.size:
            break
        image = image.resize((width, height), Image.Resampling.LANCZOS)
    raise InvalidEvidence("图片无法压缩到 1 MB 以内")
