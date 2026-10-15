def main():
    from openai import OpenAI

    client = OpenAI(base_url="http://127.0.0.1:8085", api_key="TEST")
    try:
        models = client.models.list()
        print("Available models:")
        for model in models.data:
            print(f"- {model.id}")
    except Exception as error:
        print(f"Error fetching models: {error}")

    completion = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "detailed thinking on"},
            {"role": "user", "content": "Test."},
        ],
        temperature=0.6,
        top_p=0.7,
        max_tokens=4096,
        frequency_penalty=0,
        presence_penalty=0,
        stream=False,
    )
    print("Completion response:")
    print(completion)


if __name__ == "__main__":
    main()
