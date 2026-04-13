const apiKey = "sk_f2a0d378048edc5ceb7108296de4e05a261ca4eb4bff8ed2";
const voiceId = "1Z9SUkvx5gRIEOA9KIRP";

async function generateVoice(text) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.7
        }
      })
    }
  );

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);

  return audioUrl;
}

async function playVoice() {
  try {
    const audioUrl = await generateVoice(
      "Bonjour ! Je suis ton guide en réalité augmentée."
    );

    const audio = new Audio(audioUrl);
    audio.play();

  } catch (error) {
    console.error("Erreur ElevenLabs :", error);
  }
}

document.getElementById("voiceBtn").addEventListener("click", playVoice);
