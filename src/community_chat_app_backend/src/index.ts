import {
  Canister,
  Err,
  Ok,
  Principal,
  Record,
  Result,
  StableBTreeMap,
  Variant,
  Vec,
  ic,
  nat64,
  query,
  text,
  update,
} from "azle";

// Define types
const User = Record({
  id: Principal,
  username: text,
  groupsCreated: Vec(text),
  createdAt: nat64,
});
const DirectMessage = Record({
  from: Principal,
  messageText: text,
});
const Message = Record({
  id: Principal,
  sender: Principal,
  messageText: text,
  createdAt: nat64,
});
const Communities = Record({
  id: Principal,
  owner: Principal,
  nameOfCommunity: text,
  members: Vec(text),
  messages: Vec(Message),
  createdAt: nat64,
});

// Payloads
const UserPayload = Record({
  username: text,
});
const CommunitiesPayload = Record({
  nameOfCommunity: text,
  usernameOfCreator: text,
});
const DeleteCommunityPayload = Record({
  owner: Principal,
  nameOfCommunity: text,
});
const JoinCommunityPayload = Record({
  username: text,
  groupName: text,
});
const ExitCommunityPayload = Record({
  username: text,
  groupName: text,
});
const RemoveUserPayload = Record({
  owner: Principal,
  nameOfCommunity: text,
  user: text,
});
const SendMessagePayload = Record({
  messageToSend: text,
  communityName: text,
  username: text,
});
const MessageRetrieverPayload = Record({
  username: text,
  groupName: text,
});

// Return Types
const CommunityReturnType = Record({
  name: text,
  owner: Principal,
});

// Error Types
const CommunityAppErrors = Variant({
  CommunityDoesNotExist: text,
  CommunityAlreadyExist: text,
  UserDoesNotExist: text,
  EnterCorrectDetails: text,
  GroupNameIsRequired: text,
  NoMessageWithSuchId: text,
  UserNameAlreadyExist: text,
  UsernameIsRequired: text,
  CredentialsMissing: text,
  OnlyOwnerCanDelete: text,
  ErrorWhenExitingGroup: text,
  NotAMemberOfGroup: text,
  AlreadyAMember: text,
});

// Storages
const userStorages = StableBTreeMap<text, User>(0);
const communitiesStorage = StableBTreeMap<text, Communities>(1);
const communityGroupStorages = StableBTreeMap<text, CommunityReturnType>(2);

// Helper Functions
function generateId(): Principal {
  const randomBytes = new Array(29)
    .fill(0)
    .map(() => Math.floor(Math.random() * 256));
  return Principal.fromUint8Array(Uint8Array.from(randomBytes));
}

function checkIfCommunityExists(nameOfCommunity: string): boolean {
  return communitiesStorage.get(nameOfCommunity).Some != null;
}

function checkIfUserExists(username: string): boolean {
  return userStorages.get(username).Some != null;
}

function checkIfUserInCommunity(username: string, community: Communities): boolean {
  return community.members.includes(username);
}

// Canister Methods
export default Canister({
  // User registration
  registerUser: update([UserPayload], Result(text, CommunityAppErrors), (payload) => {
    if (!payload.username) {
      return Err({ UsernameIsRequired: "Username is required" });
    }

    if (checkIfUserExists(payload.username)) {
      return Err({
        UserNameAlreadyExist: "Username is already taken, try another one",
      });
    }

    const newUser: User = {
      id: ic.caller(),
      username: payload.username,
      groupsCreated: [],
      createdAt: ic.time(),
    };

    userStorages.insert(payload.username, newUser);
    return Ok(`User with username ${payload.username} has been created successfully`);
  }),

  // Create a community
  createCommunity: update([CommunitiesPayload], Result(text, CommunityAppErrors), (payload) => {
    if (!payload.nameOfCommunity) {
      return Err({ CredentialsMissing: "Community name is missing" });
    }

    if (checkIfCommunityExists(payload.nameOfCommunity)) {
      return Err({
        CommunityAlreadyExist: `Community with name ${payload.nameOfCommunity} already exists`,
      });
    }

    const user = userStorages.get(payload.usernameOfCreator).Some;
    if (!user) {
      return Err({
        UserDoesNotExist: `User with username ${payload.usernameOfCreator} is not registered`,
      });
    }

    const communityId = generateId();
    const newCommunity: Communities = {
      id: communityId,
      owner: ic.caller(),
      nameOfCommunity: payload.nameOfCommunity,
      members: [payload.usernameOfCreator],
      messages: [],
      createdAt: ic.time(),
    };

    const communityGroups: CommunityReturnType = {
      name: payload.nameOfCommunity,
      owner: communityId,
    };

    communityGroupStorages.insert(payload.nameOfCommunity, communityGroups);
    communitiesStorage.insert(payload.nameOfCommunity, newCommunity);

    user.groupsCreated.push(payload.nameOfCommunity);
    userStorages.insert(payload.usernameOfCreator, user);

    return Ok(`${payload.nameOfCommunity} community has been created successfully`);
  }),

  // Get all created communities
  getAllCommunities: query([], Vec(CommunityReturnType), () => {
    return communityGroupStorages.values();
  }),

  // Delete a community
  deleteCommunity: update([DeleteCommunityPayload], Result(text, CommunityAppErrors), (payload) => {
    if (!payload.nameOfCommunity || !payload.owner) {
      return Err({ CredentialsMissing: "Some credentials are missing" });
    }

    const community = communitiesStorage.get(payload.nameOfCommunity).Some;
    if (!community) {
      return Err({
        CommunityDoesNotExist: `Community ${payload.nameOfCommunity} does not exist`,
      });
    }

    if (community.owner.toText() !== payload.owner.toText()) {
      return Err({
        OnlyOwnerCanDelete: "Only the owner can delete the community",
      });
    }

    communitiesStorage.remove(payload.nameOfCommunity);
    communityGroupStorages.remove(payload.nameOfCommunity);

    // Remove from user's created community array
    const user = userStorages.get(community.members[0]).Some;
    user.groupsCreated = user.groupsCreated.filter((name) => name !== payload.nameOfCommunity);
    userStorages.insert(community.members[0], user);

    return Ok(`${payload.nameOfCommunity} has been successfully deleted`);
  }),

  // User joins a community
  joinCommunity: update([JoinCommunityPayload], Result(text, CommunityAppErrors), (payload) => {
    if (!payload.groupName || !payload.username) {
      return Err({ CredentialsMissing: "Missing credentials" });
    }

    const user = userStorages.get(payload.username).Some;
    if (!user) {
      return Err({
        UserDoesNotExist: `User with username ${payload.username} does not exist`,
      });
    }

    const community = communitiesStorage.get(payload.groupName).Some;
    if (!community) {
      return Err({
        CommunityDoesNotExist: `Community with name ${payload.groupName} does not exist`,
      });
    }

    if (checkIfUserInCommunity(payload.username, community)) {
      return Err({
        AlreadyAMember: "User is already a member of the community",
      });
    }

    community.members.push(payload.username);
    communitiesStorage.insert(payload.groupName, community);

    return Ok(`Successfully joined ${payload.groupName} community`);
  }),

  // User exits a community
  exitCommunity: update([ExitCommunityPayload], Result(text, CommunityAppErrors), (payload) => {
    if (!payload.groupName || !payload.username) {
      return Err({ CredentialsMissing: "Some credentials are missing" });
    }

    const user = userStorages.get(payload.username).Some;
    if (!user) {
      return Err({
        UserDoesNotExist: `User with username ${payload.username} does not exist`,
      });
    }

    const community = communitiesStorage.get(payload.groupName).Some;
    if (!community) {
      return Err({
        CommunityDoesNotExist: `Community with name ${payload.groupName} does not exist`,
      });
    }

    if (!checkIfUserInCommunity(payload.username, community)) {
      return Err({
        NotAMemberOfGroup: `User with username ${payload.username} is not a member of the community`,
      });
    }

    community.members = community.members.filter((member) => member !== payload.username);
    communitiesStorage.insert(payload.groupName, community);

    return Ok("Successfully exited the community");
  }),

  // Owner removes a user from the community
  removeUser: update([RemoveUserPayload], Result(text, CommunityAppErrors), (payload) => {
    if (!payload.nameOfCommunity || !payload.owner || !payload.user) {
      return Err({ CredentialsMissing: "Some credentials are missing" });
    }

    const community = communitiesStorage.get(payload.nameOfCommunity).Some;
    if (!community) {
      return Err({
        CommunityDoesNotExist: `Community ${payload.nameOfCommunity} does not exist`,
      });
    }

    if (community.owner.toText() !== payload.owner.toText()) {
      return Err({ OnlyOwnerCanDelete: "Only the owner can remove users" });
    }

    if (!checkIfUserExists(payload.user)) {
      return Err({
        UserDoesNotExist: `User with username ${payload.user} does not exist`,
      });
    }

    if (!checkIfUserInCommunity(payload.user, community)) {
      return Err({
        NotAMemberOfGroup: `User with username ${payload.user} is not a member of the community`,
      });
    }

    community.members = community.members.filter((member) => member !== payload.user);
    communitiesStorage.insert(payload.nameOfCommunity, community);

    return Ok(`Successfully removed ${payload.user}`);
  }),

  // Send a message to the community group
  sendMessageToGroup: update([SendMessagePayload], Result(text, CommunityAppErrors), (payload) => {
    if (!payload.communityName || !payload.messageToSend) {
      return Err({ CredentialsMissing: "Missing credentials" });
    }

    const community = communitiesStorage.get(payload.communityName).Some;
    if (!community) {
      return Err({
        CommunityDoesNotExist: `Community ${payload.communityName} does not exist`,
      });
    }

    const user = userStorages.get(payload.username).Some;
    if (!user) {
      return Err({
        UserDoesNotExist: "You must be registered in order to send messages to the community",
      });
    }

    if (!checkIfUserInCommunity(payload.username, community)) {
      return Err({
        NotAMemberOfGroup: `User with username ${payload.username} is not a member of the community`,
      });
    }

    const newMessage: Message = {
      id: generateId(),
      sender: ic.caller(),
      messageText: payload.messageToSend,
      createdAt: ic.time(),
    };

    community.messages.push(newMessage);
    communitiesStorage.insert(payload.communityName, community);

    return Ok("Message sent successfully");
  }),

  // Get all messages from the community
  getAllMessagesFromCommunity: query(
    [MessageRetrieverPayload],
    Result(Vec(Message), CommunityAppErrors),
    (payload) => {
      if (!payload.groupName || !payload.username) {
        return Err({ CredentialsMissing: "Some credentials are missing" });
      }

      const user = userStorages.get(payload.username).Some;
      if (!user) {
        return Err({
          UserDoesNotExist: "You must be registered in order to send messages to the community",
        });
      }

      const community = communitiesStorage.get(payload.groupName).Some;
      if (!community) {
        return Err({
          CommunityDoesNotExist: `Community ${payload.groupName} does not exist`,
        });
      }

      if (!checkIfUserInCommunity(payload.username, community)) {
        return Err({
          NotAMemberOfGroup: "You are not a member of the community",
        });
      }

      return Ok(community.messages);
    }
  ),
});
