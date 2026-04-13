const button = document.getElementById("talkBtn");

button.addEventListener("click", async () => {
  try {
    const apiKey = "TON_API_KEY";
    const voiceId = "TON_VOICE_ID";

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: "Bonjour ! Je suis ton guide en réalité augmentée.",
          model_id: "eleven_multilingual_v2"
        })
      }
    );

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    const audio = new Audio(audioUrl);
    audio.play();

  } catch (error) {
    console.error("Erreur ElevenLabs :", error);
  }
});
