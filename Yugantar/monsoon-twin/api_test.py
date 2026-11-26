# pip install openai
from openai import OpenAI

client = OpenAI(
    base_url="https://creo.creoai.workers.dev/v1",
    api_key="cr_LkLWpGcoIQvLFvLpmai47d10NUYUFbem",
)

resp = client.chat.completions.create(
    model="@cf/openai/gpt-oss-120b",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)