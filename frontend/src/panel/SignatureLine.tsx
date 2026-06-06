import { tokenizeSignature, type Token } from './signature.ts';
import './SignatureLine.css';

interface SignatureLineProps {
  sig: string;
}

export function SignatureLine({ sig }: SignatureLineProps) {
  const tokens = tokenizeSignature(sig);
  return (
    <code className="item-sig">
      {tokens.map((token, i) => (
        <SigToken key={i} token={token} />
      ))}
    </code>
  );
}

function SigToken({ token }: { token: Token }) {
  return <span className={`sig-${token.kind}`}>{token.text}</span>;
}
