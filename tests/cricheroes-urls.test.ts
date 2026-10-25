import { describe, expect, it } from "vitest";
import { findTeamUrlInHtml, parseTeamUrl } from "@/modules/cricheroes/urls";
import { cricheroesTeam } from "@/modules/settings/settings";

describe("CricHeroes team link", () => {
  it("reads the origin and team id from team page links", () => {
    expect(parseTeamUrl("https://cricheroes.com/team-profile/2921535/Viking-Warriors")).toEqual({
      origin: "https://cricheroes.com",
      teamId: 2921535,
      url: "https://cricheroes.com/team-profile/2921535/Viking-Warriors",
    });
    // Sub-pages, query strings and a different domain all work
    expect(parseTeamUrl(" https://www.cricheroes.in/team-profile/42/New-Name/matches?utm=x ")).toEqual({
      origin: "https://www.cricheroes.in",
      teamId: 42,
      url: "https://www.cricheroes.in/team-profile/42/New-Name",
    });
    expect(parseTeamUrl("https://cricheroes.com/team-profile/7/team/members")?.url).toBe("https://cricheroes.com/team-profile/7");
  });

  it("rejects links that are not team pages", () => {
    expect(parseTeamUrl("https://chshare.link/team/mCVu8x")).toBeNull();
    expect(parseTeamUrl("2921535")).toBeNull();
    expect(parseTeamUrl("javascript:alert(1)//team-profile/1")).toBeNull();
  });

  it("finds the team link inside a chshare.link share page", () => {
    const html = `<script id="__NEXT_DATA__">{"link_data":{"url":"https://cricheroes.com/team-profile/2921535/Viking-Warriors","utm_source":"app"}}</script>`;
    expect(findTeamUrlInHtml(html)).toBe("https://cricheroes.com/team-profile/2921535/Viking-Warriors");
  });

  it("falls back to the saved team id when the stored link is unusable", () => {
    expect(cricheroesTeam({ cricheroes_team_url: "", team_id: 99 })).toMatchObject({ origin: "https://cricheroes.com", teamId: 99 });
    expect(cricheroesTeam({ cricheroes_team_url: "https://cricheroes.in/team-profile/5/X", team_id: 99 })).toMatchObject({
      origin: "https://cricheroes.in",
      teamId: 5,
    });
  });
});
