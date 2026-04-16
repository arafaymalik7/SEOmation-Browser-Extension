import { escapeRegExp } from "./utils";

interface RobotsGroup {
  agents: string[];
  allows: string[];
  disallows: string[];
}

function parseRobots(robotsTxt: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let currentGroup: RobotsGroup | null = null;
  let hasRules = false;

  const lines = robotsTxt.split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = lineRaw.split("#")[0].trim();
    if (!line) {
      continue;
    }

    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      if (!currentGroup || hasRules) {
        currentGroup = { agents: [], allows: [], disallows: [] };
        groups.push(currentGroup);
        hasRules = false;
      }
      currentGroup.agents.push(value.toLowerCase());
      continue;
    }

    if (!currentGroup) {
      continue;
    }

    if (key === "allow") {
      currentGroup.allows.push(value);
      hasRules = true;
    } else if (key === "disallow") {
      currentGroup.disallows.push(value);
      hasRules = true;
    }
  }

  return groups;
}

function ruleToRegex(rule: string): RegExp {
  const endsWithDollar = rule.endsWith("$");
  const cleanRule = endsWithDollar ? rule.slice(0, -1) : rule;
  const escaped = escapeRegExp(cleanRule).replace(/\\\*/g, ".*");
  const suffix = endsWithDollar ? "$" : "";
  return new RegExp(`^${escaped}${suffix}`);
}

function longestMatchingRule(path: string, rules: string[]): number {
  let longest = -1;
  for (const rule of rules) {
    if (rule === "") {
      continue;
    }
    try {
      const regex = ruleToRegex(rule);
      if (regex.test(path)) {
        longest = Math.max(longest, rule.length);
      }
    } catch {
      if (path.startsWith(rule)) {
        longest = Math.max(longest, rule.length);
      }
    }
  }
  return longest;
}

export function isPathAllowedByRobots(robotsTxt: string, pathWithQuery: string): boolean {
  const groups = parseRobots(robotsTxt);
  const applicable = groups.filter((group) => group.agents.includes("*"));
  if (applicable.length === 0) {
    return true;
  }

  const mergedAllows: string[] = [];
  const mergedDisallows: string[] = [];
  for (const group of applicable) {
    mergedAllows.push(...group.allows);
    mergedDisallows.push(...group.disallows);
  }

  const longestAllow = longestMatchingRule(pathWithQuery, mergedAllows);
  const longestDisallow = longestMatchingRule(pathWithQuery, mergedDisallows);

  if (longestDisallow === -1) {
    return true;
  }
  if (longestAllow === -1) {
    return false;
  }
  return longestAllow >= longestDisallow;
}
