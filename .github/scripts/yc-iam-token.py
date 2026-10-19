"""IAM-токен Yandex Cloud из авторизованного ключа сервисного аккаунта."""

import json
import os
import sys
import time
import urllib.request

import jwt

IAM_TOKENS_URL = "https://iam.api.cloud.yandex.net/iam/v1/tokens"

key = json.load(open(os.environ["YC_KEY_FILE"], encoding="utf-8"))
now = int(time.time())
assertion = jwt.encode(
    {"aud": IAM_TOKENS_URL, "iss": key["service_account_id"], "iat": now, "exp": now + 360},
    key["private_key"],
    algorithm="PS256",
    headers={"kid": key["id"]},
)
request = urllib.request.Request(
    IAM_TOKENS_URL,
    data=json.dumps({"jwt": assertion}).encode(),
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(request, timeout=30) as response:
    sys.stdout.write(json.loads(response.read())["iamToken"])
