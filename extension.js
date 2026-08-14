export default new class Teste {
  async single({ titles, episode }) {
    return [{
      title: `TESTE HAYASE - ${titles?.[0] || "Anime"} - EP ${episode ?? "?"}`,
      link: "magnet:?xt=urn:btih:0000000000000000000000000000000000000000",
      hash: "0000000000000000000000000000000000000000",
      seeders: 999,
      leechers: 0,
      downloads: 999,
      size: 123456789,
      date: new Date(),
      verified: true,
      type: "alt",
      accuracy: "high"
    }]
  }

  batch = this.single
  movie = this.single

  async test() {
    return true
  }
}()
