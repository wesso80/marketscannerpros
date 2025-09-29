export default function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>That route doesn’t exist. Try the links above or go back home.</p>
      <p style={{marginTop:12}}>
        <a className="btn" href="/">Return Home</a>
      </p>
    </main>
  );
}
