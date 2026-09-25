import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  ArrowUpRight01Icon,
  AppWindowIcon,
  BrowserIcon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  ComputerScreenShareIcon,
  GridViewIcon,
  Home01Icon,
  InformationCircleIcon,
  LiveStreaming01Icon,
  Logout01Icon,
  Mail01Icon,
  Menu01Icon,
  Message01Icon,
  Mic01Icon,
  MicOff02Icon,
  MoreHorizontalIcon,
  MusicNote01Icon,
  Notification01Icon,
  PlusSignIcon,
  RadioTowerIcon,
  Refresh01Icon,
  Search01Icon,
  Settings01Icon,
  Shield01Icon,
  SparklesIcon,
  UserAdd01Icon,
  UserGroup02Icon,
  UserIcon,
  UserSettings01Icon,
  Video01Icon,
  VolumeHighIcon,
  VolumeXIcon,
} from "@hugeicons/core-free-icons";

export const telaiIcons = {
  add: PlusSignIcon,
  arrowLeft: ArrowLeft01Icon,
  arrowRight: ArrowRight01Icon,
  arrowDown: ArrowDown01Icon,
  arrowUp: ArrowUp01Icon,
  arrowUpRight: ArrowUpRight01Icon,
  appWindow: AppWindowIcon,
  browser: BrowserIcon,
  cancel: Cancel01Icon,
  check: CheckmarkCircle01Icon,
  communities: UserGroup02Icon,
  computerScreen: ComputerScreenShareIcon,
  direct: Message01Icon,
  grid: GridViewIcon,
  home: Home01Icon,
  info: InformationCircleIcon,
  live: LiveStreaming01Icon,
  logout: Logout01Icon,
  mail: Mail01Icon,
  menu: Menu01Icon,
  mic: Mic01Icon,
  micOff: MicOff02Icon,
  message: Message01Icon,
  more: MoreHorizontalIcon,
  music: MusicNote01Icon,
  notification: Notification01Icon,
  radio: RadioTowerIcon,
  refresh: Refresh01Icon,
  search: Search01Icon,
  settings: Settings01Icon,
  shield: Shield01Icon,
  sparkles: SparklesIcon,
  user: UserIcon,
  userAdd: UserAdd01Icon,
  userSettings: UserSettings01Icon,
  video: Video01Icon,
  volume: VolumeHighIcon,
  volumeOff: VolumeXIcon,
};

export function iconFor(name) {
  return telaiIcons[name] || telaiIcons.sparkles;
}

export function notificationIconFor(type, joinRequestStatus) {
  if (type === "group_invite") return telaiIcons.userAdd;
  if (type === "group_join_request") return telaiIcons.communities;
  if (type === "channel_live") return telaiIcons.live;
  if (["friend_request", "friend_accepted"].includes(type)) return telaiIcons.user;
  if (joinRequestStatus === "approved") return telaiIcons.check;
  return telaiIcons.info;
}

export const globalNavSections = [
  {
    label: "Principal",
    items: [
      { id: "home", label: "Início", icon: Home01Icon },
      { id: "live", label: "Ao vivo", icon: LiveStreaming01Icon },
      { id: "following", label: "Seguindo", icon: Refresh01Icon },
    ],
  },
  {
    label: "Comunidade",
    items: [
      { id: "groups", label: "Meus grupos", icon: UserGroup02Icon },
    ],
  },
  {
    label: "Apenas Amigos",
    items: [
      { id: "friends", label: "Amigos", icon: UserIcon },
      { id: "direct", label: "Mensagens", icon: Message01Icon },
    ],
  },
];
