export default new class TesteLegendas {
  async test() {
    return true
  }

  async single({ episode, titles }) {
    return [
      {
        url: "https://raw.githubusercontent.com/feliciano3paiva-cloud/hayasedoviske/main/test.srt",
        language: "BR"
      }
    ]
  }
}()
