export default {
  async fetch(request) {
    return Response.json({
      ok: true,
      name: "pg-quizleague",
      path: new URL(request.url).pathname,
    });
  },
};
