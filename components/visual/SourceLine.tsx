import StampLine, { type StampLineProps } from "./StampLine";
/** Once per page; keep per-row source evidence inside the folded detail. */
export default function SourceLine(props: StampLineProps) {
  return <StampLine {...props} plain />;
}
