import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-dust-grey bg-opacity-30">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gunmetal">PredictEasy</h1>
          <p className="text-gray-600 mt-2">Prediction Market Intelligence Dashboard</p>
        </div>
        <SignIn
          appearance={{
            elements: {
              formButtonPrimary: "bg-pine-blue hover:bg-opacity-90",
              card: "shadow-lg",
            },
          }}
        />
      </div>
    </div>
  );
}
