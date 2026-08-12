import type { DataSourceConfig, RawMaterial } from "../types.js";
import type { CollectContext, DataConnector } from "./base.js";
import { ensureAuthorized, materialId } from "./base.js";

/** 腾讯会议连接器 */
export const tencentMeetingConnector: DataConnector = {
  kind: "tencent_meeting",
  async collect(source: DataSourceConfig, ctx: CollectContext): Promise<RawMaterial[]> {
    ensureAuthorized(source);
    const userid = String(source.options.userid ?? "");
    const includeTranscript = Boolean(source.options.includeTranscript ?? true);
    const mockMeetings = (source.options.mockMeetings as Array<Record<string, unknown>> | undefined) ?? [];

    const meetings = mockMeetings.length
      ? mockMeetings
      : [
          {
            meetingId: "tm-1001",
            subject: "周迭代评审",
            startTime: `${ctx.config.period.end}T02:00:00Z`,
            durationMinutes: 45,
            participants: 6,
            decisions: ["确认本周范围冻结", "风险项转值班跟进"],
            transcriptSnippet: includeTranscript
              ? "讨论了交付风险与验收口径，决定统一以合并主分支为准。"
              : undefined,
          },
        ];

    return meetings.map((meeting, index) => {
      const meetingId = String(meeting.meetingId ?? `meeting-${index}`);
      const durationMinutes = Number(meeting.durationMinutes ?? 0);
      const hours = Math.round((durationMinutes / 60) * 10) / 10;
      return {
        id: materialId(source.id, meetingId),
        sourceId: source.id,
        sourceKind: "tencent_meeting" as const,
        collectedAt: ctx.now.toISOString(),
        title: String(meeting.subject ?? meetingId),
        summary: `腾讯会议 ${meetingId}，时长 ${durationMinutes} 分钟（userid=${userid || "n/a"}）`,
        occurredAt: typeof meeting.startTime === "string" ? meeting.startTime : undefined,
        raw: {
          userid,
          ...meeting,
          metricHints: {
            meeting_hours: hours,
            会议小时: hours,
            meeting_duration_hours: hours,
          },
        },
        tags: ["tencent_meeting", "meeting"],
      };
    });
  },
};
