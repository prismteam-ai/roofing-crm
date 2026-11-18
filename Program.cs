using System.Text.Json;
using Microsoft.Extensions.AI;
using Microsoft.SemanticKernel.Connectors.InMemory;
using OpenAI;
using RoofingCrm.Services;

var builder = WebApplication.CreateBuilder(args);

var openAiApiKey =
    Environment.GetEnvironmentVariable("OPENAI_API_KEY")
    ?? builder.Configuration["OPENAI_API_KEY"];

if (string.IsNullOrWhiteSpace(openAiApiKey))
{
    throw new InvalidOperationException(
        "OPENAI_API_KEY is not set. Configure it as a user or machine environment variable.");
}

var chatModel = builder.Configuration["OpenAI:ChatModel"] ?? "gpt-4o-mini";
var embeddingModel = builder.Configuration["OpenAI:EmbeddingModel"] ?? "text-embedding-3-small";

var openAiClient = new OpenAIClient(openAiApiKey);

builder.Services.AddSingleton<IEmbeddingGenerator<string, Embedding<float>>>(_ =>
    openAiClient.GetEmbeddingClient(embeddingModel).AsIEmbeddingGenerator());

builder.Services.AddSingleton<IChatClient>(_ =>
    openAiClient.GetChatClient(chatModel).AsIChatClient());

builder.Services.Configure<RagSearchOptions>(builder.Configuration.GetSection("Rag"));
builder.Services.AddSingleton<RagIndexState>();
builder.Services.AddSingleton<InMemoryVectorStore>();
builder.Services.AddSingleton<IRagSearchService, RagSearchService>();
builder.Services.AddHostedService<RagKnowledgeIndexHostedService>();

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });

builder.Services.AddSingleton<ILeadService, LeadService>();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapControllers();

app.Run();