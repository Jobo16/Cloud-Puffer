// Original, bundled artwork only. Model output never supplies a path or an external image URL.
export const stickers = {
  okay: {
    id: "okay",
    label: "收到啦",
    scene: "轻松地确认、回应感谢",
    src: "/stickers/okay.png",
  },
  cheer: {
    id: "cheer",
    label: "好耶",
    scene: "庆祝用户的好消息或小进展",
    src: "/stickers/cheer.png",
  },
  hug: {
    id: "hug",
    label: "抱抱",
    scene: "用户需要安慰或陪伴，避免用于严肃危机",
    src: "/stickers/hug.png",
  },
  thinking: {
    id: "thinking",
    label: "让我想想",
    scene: "轻松的困惑、一起琢磨，不冒充正在后台工作",
    src: "/stickers/thinking.png",
  },
} as const;
export type StickerId = keyof typeof stickers;
export const stickerIds = Object.keys(stickers) as [StickerId, ...StickerId[]];
export function stickerById(id: string | null | undefined) {
  return id && Object.hasOwn(stickers, id) ? stickers[id as StickerId] : null;
}
